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
