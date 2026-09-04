use std::path::PathBuf;

use uuid::Uuid;

use crate::{
    domain::{
        asset::{AssetAvailability, AssetKind, AssetRootKind},
        asset_thumbnail::AssetThumbnail,
    },
    repositories::{
        asset_repository::AssetRepository, environment_repository::EnvironmentRepository,
    },
    services::path_guard::validate_allowed_file,
};

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

        if validate_allowed_file(&asset.normalized_path, &allowed_roots).is_err() {
            return Ok(AssetThumbnail::unavailable(asset_id));
        }

        let _ = &self.cache_root;
        Ok(AssetThumbnail::unavailable(asset_id))
    }
}
