use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::asset::AssetRootKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetScanStatus {
    Queued,
    Running,
    Cancelling,
    Paused,
    Interrupted,
    Completed,
    CompletedWithIssues,
    Failed,
}

impl AssetScanStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Cancelling => "cancelling",
            Self::Paused => "paused",
            Self::Interrupted => "interrupted",
            Self::Completed => "completed",
            Self::CompletedWithIssues => "completed_with_issues",
            Self::Failed => "failed",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "queued" => Some(Self::Queued),
            "running" => Some(Self::Running),
            "cancelling" => Some(Self::Cancelling),
            "paused" => Some(Self::Paused),
            "interrupted" => Some(Self::Interrupted),
            "completed" => Some(Self::Completed),
            "completed_with_issues" => Some(Self::CompletedWithIssues),
            "failed" => Some(Self::Failed),
            _ => None,
        }
    }

    pub const fn can_cancel(self) -> bool {
        matches!(self, Self::Queued | Self::Running | Self::Cancelling)
    }

    pub const fn can_resume(self) -> bool {
        matches!(self, Self::Paused | Self::Interrupted)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetScanErrorSnapshot {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetScanTaskSnapshot {
    pub id: Uuid,
    pub environment_id: Uuid,
    pub status: AssetScanStatus,
    pub processed_directories: u64,
    pub pending_directories: u64,
    pub discovered_assets: u64,
    pub inserted_count: u64,
    pub updated_count: u64,
    pub unchanged_count: u64,
    pub invalidated_count: u64,
    pub issue_count: u64,
    pub current_path: Option<PathBuf>,
    pub can_cancel: bool,
    pub can_resume: bool,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub error: Option<AssetScanErrorSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClaimedScanDirectory {
    pub task_id: Uuid,
    pub root_kind: AssetRootKind,
    pub root_path: PathBuf,
    pub directory_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetScanIssue {
    pub id: i64,
    pub task_id: Uuid,
    pub path: PathBuf,
    pub code: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}
