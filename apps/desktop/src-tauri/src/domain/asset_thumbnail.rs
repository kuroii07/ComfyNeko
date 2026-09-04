use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetThumbnailState {
    Ready,
    Unsupported,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetThumbnail {
    pub asset_id: Uuid,
    pub state: AssetThumbnailState,
    pub cache_path: Option<PathBuf>,
}

impl AssetThumbnail {
    pub fn ready(asset_id: Uuid, cache_path: PathBuf) -> Self {
        Self {
            asset_id,
            state: AssetThumbnailState::Ready,
            cache_path: Some(cache_path),
        }
    }

    pub fn unsupported(asset_id: Uuid) -> Self {
        Self {
            asset_id,
            state: AssetThumbnailState::Unsupported,
            cache_path: None,
        }
    }

    pub fn unavailable(asset_id: Uuid) -> Self {
        Self {
            asset_id,
            state: AssetThumbnailState::Unavailable,
            cache_path: None,
        }
    }
}
