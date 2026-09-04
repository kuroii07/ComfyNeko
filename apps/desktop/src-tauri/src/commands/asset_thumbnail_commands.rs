use uuid::Uuid;

use crate::{
    domain::asset_thumbnail::AssetThumbnail,
    services::asset_thumbnail_service::{AssetThumbnailError, AssetThumbnailService},
};

use super::CommandErrorPayload;

pub struct AssetThumbnailCommandService {
    service: AssetThumbnailService,
}

impl AssetThumbnailCommandService {
    pub fn new(service: AssetThumbnailService) -> Self {
        Self { service }
    }

    pub async fn get(&self, asset_id: Uuid) -> Result<AssetThumbnail, CommandErrorPayload> {
        self.service
            .get_or_create(asset_id)
            .await
            .map_err(CommandErrorPayload::from)
    }
}

impl From<AssetThumbnailError> for CommandErrorPayload {
    fn from(error: AssetThumbnailError) -> Self {
        match error {
            AssetThumbnailError::AssetNotFound(asset_id) => Self {
                code: "ASSET_NOT_FOUND".to_owned(),
                message: format!("找不到资产：{asset_id}"),
                retryable: false,
            },
            AssetThumbnailError::Database(message) => Self {
                code: "THUMBNAIL_DATABASE_ERROR".to_owned(),
                message,
                retryable: true,
            },
            AssetThumbnailError::Cache(message) => Self {
                code: "THUMBNAIL_CACHE_ERROR".to_owned(),
                message,
                retryable: true,
            },
        }
    }
}
