use std::{
    fs::{self, Metadata, OpenOptions},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use image::{DynamicImage, ImageFormat, ImageReader, Limits};
use uuid::Uuid;

use crate::{
    domain::{
        asset::{AssetAvailability, AssetKind, AssetListItem, AssetRootKind},
        asset_preview::AssetPreview,
    },
    repositories::{
        asset_repository::AssetRepository, environment_repository::EnvironmentRepository,
    },
    services::path_guard::validate_allowed_file,
};

const PREVIEW_VERSION: &str = "v1";
const PREVIEW_MAX_EDGE: u32 = 2048;
const MAX_IMAGE_ALLOCATION_BYTES: u64 = 512 * 1024 * 1024;

pub struct AssetPreviewService {
    assets: AssetRepository,
    environments: EnvironmentRepository,
    cache_root: PathBuf,
}

#[derive(Debug)]
pub enum AssetPreviewError {
    AssetNotFound(Uuid),
    Database(String),
    Cache(String),
}

impl AssetPreviewService {
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

    pub async fn get_or_create(&self, asset_id: Uuid) -> Result<AssetPreview, AssetPreviewError> {
        let Some(asset) = self
            .assets
            .get(asset_id)
            .await
            .map_err(|e| AssetPreviewError::Database(e.to_string()))?
        else {
            return Err(AssetPreviewError::AssetNotFound(asset_id));
        };
        if asset.kind != AssetKind::Image {
            return Ok(AssetPreview::unsupported(asset_id));
        }
        if asset.availability != AssetAvailability::Present {
            return Ok(AssetPreview::unavailable(asset_id));
        }

        let allowed_roots = match asset.root_kind {
            AssetRootKind::Input => self
                .environments
                .get(asset.environment_id)
                .await
                .map_err(|e| AssetPreviewError::Database(e.to_string()))?
                .map(|env| env.roots.input)
                .unwrap_or_default(),
            AssetRootKind::Output => self
                .environments
                .get(asset.environment_id)
                .await
                .map_err(|e| AssetPreviewError::Database(e.to_string()))?
                .map(|env| env.roots.output)
                .unwrap_or_default(),
            AssetRootKind::Models | AssetRootKind::Workflows => {
                return Ok(AssetPreview::unsupported(asset_id))
            }
        };
        if allowed_roots.is_empty() {
            return Ok(AssetPreview::unavailable(asset_id));
        }

        let extension = asset
            .normalized_path
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if !matches!(
            extension.as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tif" | "tiff"
        ) {
            return Ok(AssetPreview::unsupported(asset_id));
        }
        let source = match validate_allowed_file(&asset.normalized_path, &allowed_roots) {
            Ok(path) => path,
            Err(_) => return Ok(AssetPreview::unavailable(asset_id)),
        };
        let metadata = match fs::metadata(&source) {
            Ok(value) => value,
            Err(_) => return Ok(AssetPreview::unavailable(asset_id)),
        };
        let cache_path = cache_path_for(&self.cache_root, &asset, &metadata)?;
        if cache_path.is_file() {
            return Ok(AssetPreview::ready(asset_id, cache_path));
        }
        let Some(image) = decode_preview(&source) else {
            return Ok(AssetPreview::unavailable(asset_id));
        };
        persist_preview(&image, &cache_path)?;
        Ok(AssetPreview::ready(asset_id, cache_path))
    }
}

fn cache_path_for(
    cache_root: &Path,
    asset: &AssetListItem,
    metadata: &Metadata,
) -> Result<PathBuf, AssetPreviewError> {
    let modified = metadata
        .modified()
        .map_err(|e| AssetPreviewError::Cache(e.to_string()))?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AssetPreviewError::Cache(e.to_string()))?
        .as_millis();
    let key = asset.id.simple().to_string();
    Ok(cache_root
        .join(PREVIEW_VERSION)
        .join(&key[..2])
        .join(format!("{}-{}-{}.webp", key, metadata.len(), modified)))
}

fn decode_preview(source: &Path) -> Option<DynamicImage> {
    let mut reader = ImageReader::open(source).ok()?.with_guessed_format().ok()?;
    let mut limits = Limits::default();
    limits.max_alloc = Some(MAX_IMAGE_ALLOCATION_BYTES);
    reader.limits(limits);
    Some(
        reader
            .decode()
            .ok()?
            .thumbnail(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE),
    )
}

fn persist_preview(image: &DynamicImage, destination: &Path) -> Result<(), AssetPreviewError> {
    let parent = destination
        .parent()
        .ok_or_else(|| AssetPreviewError::Cache("预览缓存路径缺少父目录".to_owned()))?;
    fs::create_dir_all(parent).map_err(|e| AssetPreviewError::Cache(e.to_string()))?;
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        destination
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("preview"),
        Uuid::new_v4().simple()
    ));
    if let Err(e) = image.save_with_format(&temporary, ImageFormat::WebP) {
        let _ = fs::remove_file(&temporary);
        return Err(AssetPreviewError::Cache(e.to_string()));
    }
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&temporary)
        .map_err(|e| AssetPreviewError::Cache(e.to_string()))?;
    file.sync_all()
        .map_err(|e| AssetPreviewError::Cache(e.to_string()))?;
    match fs::rename(&temporary, destination) {
        Ok(()) => Ok(()),
        Err(_) if destination.is_file() => {
            let _ = fs::remove_file(&temporary);
            Ok(())
        }
        Err(e) => {
            let _ = fs::remove_file(&temporary);
            Err(AssetPreviewError::Cache(e.to_string()))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreviewContractForTest {
    pub asset_id: String,
    pub url: String,
}

pub fn preview_response_for_test(asset_id: &str, _source_path: &Path) -> PreviewContractForTest {
    PreviewContractForTest {
        asset_id: asset_id.to_owned(),
        url: format!("asset://preview/{asset_id}.webp"),
    }
}
