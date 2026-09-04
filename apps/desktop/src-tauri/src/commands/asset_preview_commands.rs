use uuid::Uuid;

use crate::{
    domain::asset_preview::AssetPreview,
    services::asset_preview_service::{AssetPreviewError, AssetPreviewService},
};

use super::CommandErrorPayload;

pub struct AssetPreviewCommandService {
    service: AssetPreviewService,
}

impl AssetPreviewCommandService {
    pub fn new(service: AssetPreviewService) -> Self {
        Self { service }
    }

    pub async fn get(&self, asset_id: Uuid) -> Result<AssetPreview, CommandErrorPayload> {
        self.service
            .get_or_create(asset_id)
            .await
            .map_err(CommandErrorPayload::from)
    }
}

impl From<AssetPreviewError> for CommandErrorPayload {
    fn from(error: AssetPreviewError) -> Self {
        match error {
            AssetPreviewError::AssetNotFound(id) => Self {
                code: "ASSET_NOT_FOUND".to_owned(),
                message: format!("找不到资产：{id}"),
                retryable: false,
            },
            AssetPreviewError::Database(message) => Self {
                code: "PREVIEW_DATABASE_ERROR".to_owned(),
                message,
                retryable: true,
            },
            AssetPreviewError::Cache(message) => Self {
                code: "PREVIEW_CACHE_ERROR".to_owned(),
                message,
                retryable: true,
            },
        }
    }
}

pub fn parse_preview_id_for_test(value: &str) -> CommandErrorPayload {
    match Uuid::parse_str(value) {
        Ok(_) => CommandErrorPayload {
            code: "OK".to_owned(),
            message: String::new(),
            retryable: false,
        },
        Err(_) => CommandErrorPayload {
            code: "INVALID_ID".to_owned(),
            message: format!("无效的标识符：{value}"),
            retryable: false,
        },
    }
}
