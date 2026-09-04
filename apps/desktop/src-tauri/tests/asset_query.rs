use std::path::{Path, PathBuf};

use chrono::{TimeZone, Utc};
use comfyneko_core::{
    commands::asset_query_commands::{AssetQueryCommandService, AssetQueryRequest},
    domain::{
        asset::{AssetAvailability, AssetKind, AssetObservation, AssetQuery, AssetRootKind},
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_repository::AssetRepository, database::AppDatabase,
        environment_repository::EnvironmentRepository,
    },
};
use uuid::Uuid;

#[tokio::test]
async fn paginates_assets_in_stable_path_order_and_isolates_environments() {
    let fixture = QueryFixture::new().await;
    fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Output,
            AssetKind::Image,
            r"D:\ComfyUI\output\z-last.png",
        )
        .await;
    fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Output,
            AssetKind::Video,
            r"D:\ComfyUI\output\b-middle.mp4",
        )
        .await;
    fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Input,
            AssetKind::Image,
            r"D:\ComfyUI\input\A-first.png",
        )
        .await;
    fixture
        .insert(
            fixture.home.id,
            AssetRootKind::Output,
            AssetKind::Image,
            r"D:\ComfyUI\output\home-only.png",
        )
        .await;

    let first = fixture
        .assets
        .query(&AssetQuery {
            environment_id: fixture.company.id,
            kind: None,
            root_kind: None,
            directory: None,
            availability: None,
            page: 1,
            page_size: 2,
        })
        .await
        .unwrap();
    let second = fixture
        .assets
        .query(&AssetQuery {
            environment_id: fixture.company.id,
            kind: None,
            root_kind: None,
            directory: None,
            availability: None,
            page: 2,
            page_size: 2,
        })
        .await
        .unwrap();

    assert_eq!(first.total_items, 3);
    assert_eq!(first.total_pages, 2);
    assert_eq!(first.page, 1);
    assert_eq!(first.page_size, 2);
    assert_eq!(
        first
            .items
            .iter()
            .map(|item| item.name.as_str())
            .collect::<Vec<_>>(),
        vec!["A-first.png", "b-middle.mp4"]
    );
    assert_eq!(
        second
            .items
            .iter()
            .map(|item| item.name.as_str())
            .collect::<Vec<_>>(),
        vec!["z-last.png"]
    );
    assert!(first
        .items
        .iter()
        .all(|item| item.environment_id == fixture.company.id));
}

#[tokio::test]
async fn combines_kind_root_directory_and_availability_filters() {
    let fixture = QueryFixture::new().await;
    let missing = fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Models,
            AssetKind::Model,
            r"D:\ComfyUI\models\checkpoints\portrait.safetensors",
        )
        .await;
    fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Models,
            AssetKind::Model,
            r"D:\ComfyUI\models\loras\style.safetensors",
        )
        .await;
    fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Output,
            AssetKind::Image,
            r"D:\ComfyUI\output\portrait.png",
        )
        .await;
    fixture.mark_missing(missing).await;

    let page = fixture
        .assets
        .query(&AssetQuery {
            environment_id: fixture.company.id,
            kind: Some(AssetKind::Model),
            root_kind: Some(AssetRootKind::Models),
            directory: Some(PathBuf::from(r"d:\comfyui\MODELS\checkpoints\\")),
            availability: Some(AssetAvailability::Missing),
            page: 1,
            page_size: 50,
        })
        .await
        .unwrap();

    assert_eq!(page.total_items, 1);
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].id, missing);
    assert_eq!(page.items[0].name, "portrait.safetensors");
    assert_eq!(
        page.items[0].directory,
        PathBuf::from(r"D:\ComfyUI\models\checkpoints")
    );
    assert_eq!(page.items[0].availability, AssetAvailability::Missing);
    assert!(page.items[0].missing_since.is_some());
}

#[tokio::test]
async fn directory_filter_treats_sql_wildcards_as_literal_path_characters() {
    let fixture = QueryFixture::new().await;
    fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Output,
            AssetKind::Image,
            r"D:\ComfyUI\output\set_100%\wanted.png",
        )
        .await;
    fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Output,
            AssetKind::Image,
            r"D:\ComfyUI\output\setX100Y\unwanted.png",
        )
        .await;

    let page = fixture
        .assets
        .query(&AssetQuery {
            environment_id: fixture.company.id,
            kind: None,
            root_kind: None,
            directory: Some(PathBuf::from(r"D:\ComfyUI\output\set_100%")),
            availability: None,
            page: 1,
            page_size: 50,
        })
        .await
        .unwrap();

    assert_eq!(page.total_items, 1);
    assert_eq!(page.items[0].name, "wanted.png");
}

#[tokio::test]
async fn command_service_applies_defaults_and_returns_stable_serializable_page() {
    let fixture = QueryFixture::new().await;
    fixture
        .insert(
            fixture.company.id,
            AssetRootKind::Workflows,
            AssetKind::Workflow,
            r"D:\ComfyUI\workflows\portrait.json",
        )
        .await;
    let commands = AssetQueryCommandService::new(fixture.assets.clone());

    let page = commands
        .query(AssetQueryRequest {
            environment_id: fixture.company.id.to_string(),
            kind: Some(AssetKind::Workflow),
            root_kind: None,
            directory: None,
            availability: Some(AssetAvailability::Present),
            page: None,
            page_size: None,
        })
        .await
        .unwrap();
    let json = serde_json::to_string(&page).unwrap();

    assert_eq!(page.page, 1);
    assert_eq!(page.page_size, 50);
    assert_eq!(page.total_items, 1);
    assert!(json.contains(r#""availability":"present""#));
    assert!(json.contains(r#""normalized_path":"D:\\ComfyUI\\workflows\\portrait.json""#));
    assert!(!json.contains("normalizedPath"));
}

#[tokio::test]
async fn command_service_rejects_invalid_ids_and_page_bounds() {
    let fixture = QueryFixture::new().await;
    let commands = AssetQueryCommandService::new(fixture.assets.clone());

    let invalid_id = commands
        .query(AssetQueryRequest {
            environment_id: "not-a-uuid".to_owned(),
            kind: None,
            root_kind: None,
            directory: None,
            availability: None,
            page: None,
            page_size: None,
        })
        .await
        .unwrap_err();
    let invalid_page = commands
        .query(AssetQueryRequest {
            environment_id: fixture.company.id.to_string(),
            kind: None,
            root_kind: None,
            directory: None,
            availability: None,
            page: Some(0),
            page_size: Some(101),
        })
        .await
        .unwrap_err();

    assert_eq!(invalid_id.code, "INVALID_ASSET_QUERY");
    assert!(!invalid_id.retryable);
    assert_eq!(invalid_page.code, "INVALID_ASSET_QUERY");
    assert!(!invalid_page.retryable);
}

struct QueryFixture {
    database: AppDatabase,
    assets: AssetRepository,
    company: EnvironmentProfile,
    home: EnvironmentProfile,
}

impl QueryFixture {
    async fn new() -> Self {
        let database = AppDatabase::connect_in_memory().await.unwrap();
        let environments = EnvironmentRepository::from_pool(database.pool().clone())
            .await
            .unwrap();
        let company = EnvironmentProfile::new("公司环境", PathBuf::from(r"D:\ComfyUI"));
        let home = EnvironmentProfile::new("家庭环境", PathBuf::from(r"E:\ComfyUI"));
        environments.save_if_valid(&company, &[]).await.unwrap();
        environments.save_if_valid(&home, &[]).await.unwrap();
        let assets = AssetRepository::from_pool(database.pool().clone())
            .await
            .unwrap();

        Self {
            database,
            assets,
            company,
            home,
        }
    }

    async fn insert(
        &self,
        environment_id: Uuid,
        root_kind: AssetRootKind,
        kind: AssetKind,
        path: impl AsRef<Path>,
    ) -> Uuid {
        self.assets
            .upsert(&AssetObservation {
                environment_id,
                root_kind,
                normalized_path: path.as_ref().to_path_buf(),
                kind,
                size_bytes: 1024,
                modified_at: Some(Utc.with_ymd_and_hms(2026, 9, 4, 10, 0, 0).single().unwrap()),
            })
            .await
            .unwrap()
            .record()
            .id
    }

    async fn mark_missing(&self, asset_id: Uuid) {
        sqlx::query(
            r#"
            UPDATE assets
            SET is_present = 0,
                missing_since = ?
            WHERE id = ?
            "#,
        )
        .bind(
            Utc.with_ymd_and_hms(2026, 9, 4, 11, 0, 0)
                .single()
                .unwrap()
                .to_rfc3339(),
        )
        .bind(asset_id.to_string())
        .execute(self.database.pool())
        .await
        .unwrap();
    }
}
