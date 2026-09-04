use uuid::Uuid;

use crate::services::asset_detail_service::{AssetDetailError, AssetDetailService};

use super::CommandErrorPayload;

pub struct AssetDetailCommandService {
    service: AssetDetailService,
}

impl AssetDetailCommandService {
    pub fn new(service: AssetDetailService) -> Self {
        Self { service }
    }

    pub async fn get(
        &self,
        asset_id: Uuid,
    ) -> Result<crate::domain::asset_detail::AssetDetail, CommandErrorPayload> {
        self.service
            .get(asset_id)
            .await
            .map_err(CommandErrorPayload::from)
    }
}

impl From<AssetDetailError> for CommandErrorPayload {
    fn from(error: AssetDetailError) -> Self {
        match error {
            AssetDetailError::AssetNotFound(asset_id) => Self {
                code: "ASSET_NOT_FOUND".to_owned(),
                message: format!("找不到资产：{asset_id}"),
                retryable: false,
            },
            AssetDetailError::Database(message) => Self {
                code: "ASSET_DETAIL_DATABASE_ERROR".to_owned(),
                message,
                retryable: true,
            },
            AssetDetailError::MetadataRead(message) => Self {
                code: "ASSET_METADATA_READ_ERROR".to_owned(),
                message,
                retryable: true,
            },
        }
    }
}
