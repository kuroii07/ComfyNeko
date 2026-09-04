use std::{
    fs::{self, File, Metadata, OpenOptions},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use image::{DynamicImage, ImageFormat, ImageReader, Limits};
use uuid::Uuid;

use crate::{
    domain::{
        asset::{AssetAvailability, AssetKind, AssetListItem, AssetRootKind},
        asset_thumbnail::AssetThumbnail,
    },
    repositories::{
        asset_repository::AssetRepository, environment_repository::EnvironmentRepository,
    },
    services::path_guard::validate_allowed_file,
};

const THUMBNAIL_VERSION: &str = "v1";
const THUMBNAIL_MAX_EDGE: u32 = 640;
const MAX_IMAGE_ALLOCATION_BYTES: u64 = 256 * 1024 * 1024;

pub struct AssetThumbnailService {
    assets: AssetRepository,
    environments: EnvironmentRepository,
    cache_root: PathBuf,
}

#[derive(Debug)]
pub enum AssetThumbnailError {
    AssetNotFound(Uuid),
    Database(String),
    Cache(String),
}

impl AssetThumbnailService {
    pub fn new(
        assets: AssetRepository,
        environments: EnvironmentRepository,
        cache_root: PathBuf,
    ) -> Self {
        Self {
            assets,
            environments,
            cache_root,
        }
    }

    pub async fn get_or_create(
        &self,
        asset_id: Uuid,
    ) -> Result<AssetThumbnail, AssetThumbnailError> {
        let Some(asset) = self
            .assets
            .get(asset_id)
            .await
            .map_err(|error| AssetThumbnailError::Database(error.to_string()))?
        else {
            return Err(AssetThumbnailError::AssetNotFound(asset_id));
        };

        if asset.kind != AssetKind::Image {
            return Ok(AssetThumbnail::unsupported(asset_id));
        }
        if asset.availability != AssetAvailability::Present {
            return Ok(AssetThumbnail::unavailable(asset_id));
        }

        let allowed_roots = match asset.root_kind {
            AssetRootKind::Input | AssetRootKind::Output => {
                let Some(environment) = self
                    .environments
                    .get(asset.environment_id)
                    .await
                    .map_err(|error| AssetThumbnailError::Database(error.to_string()))?
                else {
                    return Ok(AssetThumbnail::unavailable(asset_id));
                };

                match asset.root_kind {
                    AssetRootKind::Input => environment.roots.input,
                    AssetRootKind::Output => environment.roots.output,
                    AssetRootKind::Models | AssetRootKind::Workflows => {
                        unreachable!()
                    }
                }
            }
            AssetRootKind::Models | AssetRootKind::Workflows => {
                return Ok(AssetThumbnail::unsupported(asset_id));
            }
        };

        let extension = asset
            .normalized_path
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if !matches!(
            extension.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tif" | "tiff"
        ) {
            return Ok(AssetThumbnail::unsupported(asset_id));
        }

        let source_path = match validate_allowed_file(&asset.normalized_path, &allowed_roots) {
            Ok(path) => path,
            Err(_) => {
                return Ok(AssetThumbnail::unavailable(asset_id));
            }
        };
        let source_metadata = match fs::metadata(&source_path) {
            Ok(metadata) => metadata,
            Err(_) => {
                return Ok(AssetThumbnail::unavailable(asset_id));
            }
        };
        let cache_path = cache_path_for(&self.cache_root, &asset, &source_metadata)?;

        if cache_path.is_file() {
            cleanup_stale_thumbnails(&cache_path, asset_id)?;
            return Ok(AssetThumbnail::ready(asset_id, cache_path));
        }

        let Some(thumbnail) = decode_thumbnail(&source_path) else {
            return Ok(AssetThumbnail::unavailable(asset_id));
        };
        persist_thumbnail(&thumbnail, &cache_path)?;
        cleanup_stale_thumbnails(&cache_path, asset_id)?;

        Ok(AssetThumbnail::ready(asset_id, cache_path))
    }
}

fn cache_path_for(
    cache_root: &Path,
    asset: &AssetListItem,
    source_metadata: &Metadata,
) -> Result<PathBuf, AssetThumbnailError> {
    let modified_millis = source_metadata
        .modified()
        .map_err(|error| AssetThumbnailError::Cache(format!("无法读取源图片修改时间：{error}")))?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AssetThumbnailError::Cache(format!("源图片修改时间无效：{error}")))?
        .as_millis();
    let asset_key = asset.id.simple().to_string();

    Ok(cache_root
        .join(THUMBNAIL_VERSION)
        .join(&asset_key[..2])
        .join(format!(
            "{}-{}-{}.webp",
            asset_key,
            source_metadata.len(),
            modified_millis
        )))
}

fn decode_thumbnail(source: &Path) -> Option<DynamicImage> {
    let mut reader = ImageReader::open(source).ok()?.with_guessed_format().ok()?;
    let mut limits = Limits::default();
    limits.max_alloc = Some(MAX_IMAGE_ALLOCATION_BYTES);
    reader.limits(limits);
    let image = reader.decode().ok()?;

    Some(image.thumbnail(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE))
}

fn persist_thumbnail(
    thumbnail: &DynamicImage,
    destination: &Path,
) -> Result<(), AssetThumbnailError> {
    let parent = destination
        .parent()
        .ok_or_else(|| AssetThumbnailError::Cache("缩略图缓存路径缺少父目录".to_owned()))?;
    fs::create_dir_all(parent)
        .map_err(|error| AssetThumbnailError::Cache(format!("无法创建缩略图缓存目录：{error}")))?;

    if destination.is_file() {
        return Ok(());
    }

    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        destination
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("thumbnail"),
        Uuid::new_v4().simple()
    ));
    if let Err(error) = thumbnail.save_with_format(&temporary, ImageFormat::WebP) {
        let _ = fs::remove_file(&temporary);
        return Err(AssetThumbnailError::Cache(format!(
            "无法写入缩略图缓存：{error}"
        )));
    }
    if let Err(error) = sync_file(&temporary) {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }

    match fs::rename(&temporary, destination) {
        Ok(()) => Ok(()),
        Err(_) if destination.is_file() => {
            let _ = fs::remove_file(&temporary);
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            Err(AssetThumbnailError::Cache(format!(
                "无法提交缩略图缓存：{error}"
            )))
        }
    }
}

fn cleanup_stale_thumbnails(current: &Path, asset_id: Uuid) -> Result<(), AssetThumbnailError> {
    let parent = current
        .parent()
        .ok_or_else(|| AssetThumbnailError::Cache("缩略图缓存路径缺少父目录".to_owned()))?;
    let prefix = format!("{}-", asset_id.simple());
    let entries = fs::read_dir(parent)
        .map_err(|error| AssetThumbnailError::Cache(format!("无法读取缩略图缓存目录：{error}")))?;

    for entry in entries {
        let path = entry
            .map_err(|error| AssetThumbnailError::Cache(format!("无法读取缩略图缓存项：{error}")))?
            .path();
        let is_stale_thumbnail = path != current
            && path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.starts_with(&prefix))
            && path.extension().and_then(|value| value.to_str()) == Some("webp");

        if is_stale_thumbnail {
            match fs::remove_file(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(AssetThumbnailError::Cache(format!(
                        "无法清理旧缩略图缓存：{error}"
                    )));
                }
            }
        }
    }

    Ok(())
}

fn sync_file(path: &Path) -> Result<(), AssetThumbnailError> {
    let file: File = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|error| AssetThumbnailError::Cache(format!("无法打开缩略图临时文件：{error}")))?;
    file.sync_all()
        .map_err(|error| AssetThumbnailError::Cache(format!("无法同步缩略图临时文件：{error}")))
}
