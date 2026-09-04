use std::fs;

use comfyneko_core::{
    commands::asset_detail_commands::AssetDetailCommandService,
    domain::environment::EnvironmentProfile,
    repositories::{
        asset_metadata_repository::AssetMetadataRepository, asset_repository::AssetRepository,
        environment_repository::EnvironmentRepository,
    },
    services::asset_detail_service::AssetDetailService,
};
use tempfile::TempDir;
use uuid::Uuid;

#[tokio::test]
async fn unknown_assets_keep_the_existing_non_retryable_not_found_contract() {
    let fixture = CommandFixture::new().await;
    let asset_id = Uuid::new_v4();

    let error = fixture.commands.get(asset_id).await.unwrap_err();

    assert_eq!(error.code, "ASSET_NOT_FOUND");
    assert!(!error.retryable);
    assert!(error.message.contains(&asset_id.to_string()));
}

struct CommandFixture {
    _temp_dir: TempDir,
    commands: AssetDetailCommandService,
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
        let mut environment = EnvironmentProfile::new("命令详情测试环境", comfy_root);
        environment.roots.input = vec![input_root];
        environment.roots.output = vec![output_root];
        environments.save_if_valid(&environment, &[]).await.unwrap();
        let assets = AssetRepository::connect_file(&database_path).await.unwrap();
        let metadata = AssetMetadataRepository::from_pool(
            sqlx::SqlitePool::connect(&format!("sqlite:{}", database_path.display()))
                .await
                .unwrap(),
        )
        .await
        .unwrap();

        Self {
            _temp_dir: temp_dir,
            commands: AssetDetailCommandService::new(AssetDetailService::new(
                assets,
                environments,
                metadata,
            )),
        }
    }
}
