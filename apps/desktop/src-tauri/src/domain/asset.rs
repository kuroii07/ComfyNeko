use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Image,
    Video,
    Audio,
    Model,
    Workflow,
}

impl AssetKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Model => "model",
            Self::Workflow => "workflow",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "image" => Some(Self::Image),
            "video" => Some(Self::Video),
            "audio" => Some(Self::Audio),
            "model" => Some(Self::Model),
            "workflow" => Some(Self::Workflow),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetRootKind {
    Input,
    Output,
    Models,
    Workflows,
}

impl AssetRootKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Input => "input",
            Self::Output => "output",
            Self::Models => "models",
            Self::Workflows => "workflows",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "input" => Some(Self::Input),
            "output" => Some(Self::Output),
            "models" => Some(Self::Models),
            "workflows" => Some(Self::Workflows),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetAvailability {
    Present,
    Missing,
}

impl AssetAvailability {
    pub const fn as_database_value(self) -> i64 {
        match self {
            Self::Present => 1,
            Self::Missing => 0,
        }
    }

    pub fn from_database_value(value: i64) -> Option<Self> {
        match value {
            1 => Some(Self::Present),
            0 => Some(Self::Missing),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetScanRoot {
    pub kind: AssetRootKind,
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetObservation {
    pub environment_id: Uuid,
    pub root_kind: AssetRootKind,
    pub normalized_path: PathBuf,
    pub kind: AssetKind,
    pub size_bytes: u64,
    pub modified_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetRecord {
    pub id: Uuid,
    pub observation: AssetObservation,
    pub fingerprint: Option<String>,
    pub indexed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetQuery {
    pub environment_id: Uuid,
    pub kind: Option<AssetKind>,
    pub root_kind: Option<AssetRootKind>,
    pub directory: Option<PathBuf>,
    pub availability: Option<AssetAvailability>,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetListItem {
    pub id: Uuid,
    pub environment_id: Uuid,
    pub root_kind: AssetRootKind,
    pub kind: AssetKind,
    pub name: String,
    pub directory: PathBuf,
    pub normalized_path: PathBuf,
    pub size_bytes: u64,
    pub modified_at: Option<DateTime<Utc>>,
    pub fingerprint: Option<String>,
    pub indexed_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub availability: AssetAvailability,
    pub missing_since: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetPage {
    pub items: Vec<AssetListItem>,
    pub page: u32,
    pub page_size: u32,
    pub total_items: u64,
    pub total_pages: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AssetUpsertOutcome {
    Inserted(AssetRecord),
    Updated(AssetRecord),
    Unchanged(AssetRecord),
}

impl AssetUpsertOutcome {
    pub fn record(&self) -> &AssetRecord {
        match self {
            Self::Inserted(record) | Self::Updated(record) | Self::Unchanged(record) => record,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use chrono::{TimeZone, Utc};
    use uuid::Uuid;

    use super::{AssetKind, AssetObservation, AssetRootKind};

    #[test]
    fn observation_round_trips_windows_path_and_enum_values() {
        let observation = AssetObservation {
            environment_id: Uuid::nil(),
            root_kind: AssetRootKind::Output,
            normalized_path: PathBuf::from(r"D:\ComfyUI\output\成品.PNG"),
            kind: AssetKind::Image,
            size_bytes: 2048,
            modified_at: Some(Utc.with_ymd_and_hms(2026, 9, 3, 12, 0, 0).single().unwrap()),
        };

        let encoded = serde_json::to_string(&observation).unwrap();
        let decoded: AssetObservation = serde_json::from_str(&encoded).unwrap();

        assert_eq!(decoded, observation);
        assert!(encoded.contains("\"root_kind\":\"output\""));
        assert!(encoded.contains("\"kind\":\"image\""));
    }
}
