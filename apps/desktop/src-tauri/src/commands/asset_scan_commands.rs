use std::path::Path;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    domain::asset_scan::{AssetScanIssue, AssetScanTaskSnapshot},
    services::asset_scan_service::{AssetScanService, AssetScanServiceError},
};

#[derive(Clone)]
pub struct AssetScanCommandService {
    service: AssetScanService,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandErrorPayload {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl AssetScanCommandService {
    pub fn new(service: AssetScanService) -> Self {
        Self { service }
    }

    pub async fn connect_file(path: impl AsRef<Path>) -> Result<Self, CommandErrorPayload> {
        AssetScanService::connect_file(path)
            .await
            .map(Self::new)
            .map_err(CommandErrorPayload::from)
    }

    pub async fn start(
        &self,
        environment_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, CommandErrorPayload> {
        self.service
            .start(environment_id)
            .await
            .map_err(CommandErrorPayload::from)
    }

    pub async fn get(&self, task_id: Uuid) -> Result<AssetScanTaskSnapshot, CommandErrorPayload> {
        self.service
            .get(task_id)
            .await
            .map_err(CommandErrorPayload::from)
    }

    pub async fn list(
        &self,
        environment_id: Option<Uuid>,
    ) -> Result<Vec<AssetScanTaskSnapshot>, CommandErrorPayload> {
        self.service
            .list(environment_id)
            .await
            .map_err(CommandErrorPayload::from)
    }

    pub async fn issues(&self, task_id: Uuid) -> Result<Vec<AssetScanIssue>, CommandErrorPayload> {
        self.service
            .issues(task_id)
            .await
            .map_err(CommandErrorPayload::from)
    }

    pub async fn cancel(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, CommandErrorPayload> {
        self.service
            .cancel(task_id)
            .await
            .map_err(CommandErrorPayload::from)
    }

    pub async fn resume(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, CommandErrorPayload> {
        self.service
            .resume(task_id)
            .await
            .map_err(CommandErrorPayload::from)
    }

    pub async fn recover_interrupted(&self) -> Result<u64, CommandErrorPayload> {
        self.service
            .recover_interrupted()
            .await
            .map_err(CommandErrorPayload::from)
    }
}

impl From<AssetScanServiceError> for CommandErrorPayload {
    fn from(error: AssetScanServiceError) -> Self {
        match error {
            AssetScanServiceError::EnvironmentNotFound { .. } => Self {
                code: "ENVIRONMENT_NOT_FOUND".to_owned(),
                message: error.to_string(),
                retryable: false,
            },
            AssetScanServiceError::TaskNotFound { .. } => Self {
                code: "SCAN_TASK_NOT_FOUND".to_owned(),
                message: error.to_string(),
                retryable: false,
            },
            AssetScanServiceError::TaskNotResumable { .. } => Self {
                code: "SCAN_TASK_NOT_RESUMABLE".to_owned(),
                message: error.to_string(),
                retryable: false,
            },
            AssetScanServiceError::NoScanRoots { .. } => Self {
                code: "NO_SCAN_ROOTS".to_owned(),
                message: error.to_string(),
                retryable: false,
            },
            AssetScanServiceError::InvalidScanRoot { .. } => Self {
                code: "SCAN_ROOT_INVALID".to_owned(),
                message: error.to_string(),
                retryable: false,
            },
            AssetScanServiceError::Database(_) => Self {
                code: "SCAN_DATABASE_ERROR".to_owned(),
                message: error.to_string(),
                retryable: true,
            },
            AssetScanServiceError::WorkerState(_) => Self {
                code: "SCAN_WORKER_ERROR".to_owned(),
                message: error.to_string(),
                retryable: true,
            },
        }
    }
}
