use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    domain::asset::{
        AssetAvailability, AssetKind, AssetPage, AssetQuery, AssetRootKind, AssetSort,
    },
    repositories::asset_repository::AssetRepository,
};

use super::CommandErrorPayload;

const DEFAULT_PAGE: u32 = 1;
const DEFAULT_PAGE_SIZE: u32 = 50;
const MAX_PAGE_SIZE: u32 = 100;

#[derive(Clone)]
pub struct AssetQueryCommandService {
    repository: AssetRepository,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetQueryRequest {
    pub environment_id: String,
    pub kind: Option<AssetKind>,
    pub root_kind: Option<AssetRootKind>,
    pub directory: Option<PathBuf>,
    pub availability: Option<AssetAvailability>,
    pub search: Option<String>,
    pub media_only: Option<bool>,
    pub sort: Option<AssetSort>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

impl AssetQueryCommandService {
    pub fn new(repository: AssetRepository) -> Self {
        Self { repository }
    }

    pub async fn connect_file(path: impl AsRef<Path>) -> Result<Self, CommandErrorPayload> {
        AssetRepository::connect_file(path)
            .await
            .map(Self::new)
            .map_err(database_error)
    }

    pub async fn query(
        &self,
        request: AssetQueryRequest,
    ) -> Result<AssetPage, CommandErrorPayload> {
        let environment_id = Uuid::parse_str(&request.environment_id)
            .map_err(|_| invalid_query("环境标识符无效"))?;
        let page = request.page.unwrap_or(DEFAULT_PAGE);
        let page_size = request.page_size.unwrap_or(DEFAULT_PAGE_SIZE);

        if page == 0 {
            return Err(invalid_query("页码必须从 1 开始"));
        }
        if !(1..=MAX_PAGE_SIZE).contains(&page_size) {
            return Err(invalid_query("每页数量必须在 1 到 100 之间"));
        }
        if request
            .directory
            .as_ref()
            .is_some_and(|path| path.to_string_lossy().trim().is_empty())
        {
            return Err(invalid_query("目录筛选不能为空"));
        }
        let search = request
            .search
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        if search
            .as_ref()
            .is_some_and(|value| value.chars().count() > 200)
        {
            return Err(invalid_query("搜索内容不能超过 200 个字符"));
        }

        self.repository
            .query(&AssetQuery {
                environment_id,
                kind: request.kind,
                root_kind: request.root_kind,
                directory: request.directory,
                availability: request.availability,
                search,
                media_only: request.media_only.unwrap_or(false),
                sort: request.sort,
                page,
                page_size,
            })
            .await
            .map_err(database_error)
    }
}

fn invalid_query(message: impl Into<String>) -> CommandErrorPayload {
    CommandErrorPayload {
        code: "INVALID_ASSET_QUERY".to_owned(),
        message: message.into(),
        retryable: false,
    }
}

fn database_error(error: impl ToString) -> CommandErrorPayload {
    CommandErrorPayload {
        code: "ASSET_DATABASE_ERROR".to_owned(),
        message: error.to_string(),
        retryable: true,
    }
}
