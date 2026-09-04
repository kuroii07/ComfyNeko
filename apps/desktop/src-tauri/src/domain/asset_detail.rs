use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetMetadataState {
    Available,
    Empty,
    Invalid,
}

impl AssetMetadataState {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Available => "available",
            Self::Empty => "empty",
            Self::Invalid => "invalid",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "available" => Some(Self::Available),
            "empty" => Some(Self::Empty),
            "invalid" => Some(Self::Invalid),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedAssetPngMetadata {
    pub asset_id: Uuid,
    pub parser_version: String,
    pub source_size_bytes: u64,
    pub source_modified_at: DateTime<Utc>,
    pub state: AssetMetadataState,
    pub prompt_text: Option<String>,
    pub workflow_text: Option<String>,
    pub parsed_at: DateTime<Utc>,
}
