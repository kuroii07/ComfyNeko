use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetPreviewState {
    Ready,
    Unsupported,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetPreview {
    pub asset_id: Uuid,
    pub state: AssetPreviewState,
    pub cache_path: Option<PathBuf>,
}

impl AssetPreview {
    pub fn ready(asset_id: Uuid, cache_path: PathBuf) -> Self {
        Self {
            asset_id,
            state: AssetPreviewState::Ready,
            cache_path: Some(cache_path),
        }
    }

    pub fn unsupported(asset_id: Uuid) -> Self {
        Self {
            asset_id,
            state: AssetPreviewState::Unsupported,
            cache_path: None,
        }
    }

    pub fn unavailable(asset_id: Uuid) -> Self {
        Self {
            asset_id,
            state: AssetPreviewState::Unavailable,
            cache_path: None,
        }
    }
}
