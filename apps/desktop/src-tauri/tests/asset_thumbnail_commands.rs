use std::{fs, path::PathBuf};

use chrono::{TimeZone, Utc};
use comfyneko_core::{
    commands::asset_thumbnail_commands::AssetThumbnailCommandService,
    domain::{
        asset::{AssetKind, AssetObservation, AssetRootKind},
        asset_thumbnail::AssetThumbnailState,
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_repository::AssetRepository, environment_repository::EnvironmentRepository,
    },
    services::asset_thumbnail_service::AssetThumbnailService,
};
use image::{ImageFormat, Rgb, RgbImage};
use tempfile::TempDir;
use uuid::Uuid;

#[tokio::test]
async fn unknown_assets_map_to_a_stable_non_retryable_command_error() {
    let fixture = CommandFixture::new().await;
    let asset_id = Uuid::new_v4();

    let error = fixture.commands.get(asset_id).await.unwrap_err();

    assert_eq!(error.code, "ASSET_NOT_FOUND");
    assert!(!error.retryable);
    assert!(error.message.contains(&asset_id.to_string()));
}

#[tokio::test]
async fn ready_thumbnail_responses_keep_the_snake_case_wire_contract() {
    let fixture = CommandFixture::new().await;
    let source_path = fixture.output_root.join("command-preview.png");
    RgbImage::from_pixel(960, 640, Rgb([42, 112, 186]))
        .save_with_format(&source_path, ImageFormat::Png)
        .unwrap();
    let asset_id = fixture
        .assets
        .upsert(&AssetObservation {
            environment_id: fixture.environment.id,
            root_kind: AssetRootKind::Output,
            normalized_path: source_path,
            kind: AssetKind::Image,
            size_bytes: 1_024,
            modified_at: Some(Utc.with_ymd_and_hms(2026, 9, 4, 14, 0, 0).single().unwrap()),
        })
        .await
        .unwrap()
        .record()
        .id;

    let thumbnail = fixture.commands.get(asset_id).await.unwrap();
    let json = serde_json::to_value(&thumbnail).unwrap();

    assert_eq!(thumbnail.state, AssetThumbnailState::Ready);
    assert!(thumbnail.cache_path.unwrap().is_file());
    assert_eq!(json["asset_id"], asset_id.to_string());
    assert_eq!(json["state"], "ready");
    assert!(json["cache_path"].as_str().is_some());
    assert!(json.get("assetId").is_none());
}

struct CommandFixture {
    _temp_dir: TempDir,
    environment: EnvironmentProfile,
    assets: AssetRepository,
    output_root: PathBuf,
    commands: AssetThumbnailCommandService,
}

impl CommandFixture {
    async fn new() -> Self {
        let temp_dir = tempfile::tempdir().unwrap();
        let database_path = temp_dir.path().join("comfyneko.db");
        let comfy_root = temp_dir.path().join("ComfyUI");
        let input_root = comfy_root.join("input");
        let output_root = comfy_root.join("output");
        fs::create_dir_all(&input_root).unwrap();
        fs::create_dir_all(&output_root).unwrap();

        let environments = EnvironmentRepository::connect_file(&database_path)
            .await
            .unwrap();
        let mut environment = EnvironmentProfile::new("命令测试环境", comfy_root);
        environment.roots.input = vec![input_root];
        environment.roots.output = vec![output_root.clone()];
        environments.save_if_valid(&environment, &[]).await.unwrap();
        let assets = AssetRepository::connect_file(&database_path).await.unwrap();
        let service = AssetThumbnailService::new(
            assets.clone(),
            environments,
            temp_dir.path().join("cache").join("thumbnails"),
        );

        Self {
            _temp_dir: temp_dir,
            environment,
            assets,
            output_root,
            commands: AssetThumbnailCommandService::new(service),
        }
    }
}
