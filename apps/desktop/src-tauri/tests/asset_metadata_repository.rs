use std::path::PathBuf;

use chrono::{TimeZone, Utc};
use comfyneko_core::{
    domain::{
        asset::{AssetKind, AssetObservation, AssetRootKind},
        asset_detail::{AssetMetadataState, CachedAssetPngMetadata},
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_metadata_repository::AssetMetadataRepository, asset_repository::AssetRepository,
        database::AppDatabase, environment_repository::EnvironmentRepository,
    },
};

#[tokio::test]
async fn caches_and_replaces_complete_png_metadata_for_one_asset() {
    let database = AppDatabase::connect_in_memory().await.unwrap();
    let environments = EnvironmentRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let environment = EnvironmentProfile::new("测试环境", PathBuf::from(r"D:\ComfyUI"));
    environments.save_if_valid(&environment, &[]).await.unwrap();
    let assets = AssetRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let asset_id = assets
        .upsert(&AssetObservation {
            environment_id: environment.id,
            root_kind: AssetRootKind::Output,
            normalized_path: PathBuf::from(r"D:\ComfyUI\output\metadata.png"),
            kind: AssetKind::Image,
            size_bytes: 2048,
            modified_at: Some(Utc.with_ymd_and_hms(2026, 9, 4, 8, 0, 0).single().unwrap()),
        })
        .await
        .unwrap()
        .record()
        .id;
    let repository = AssetMetadataRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let modified_at = Utc.with_ymd_and_hms(2026, 9, 4, 8, 0, 0).single().unwrap();
    let parsed_at = Utc.with_ymd_and_hms(2026, 9, 4, 8, 1, 0).single().unwrap();
    let available = CachedAssetPngMetadata {
        asset_id,
        parser_version: "v1".to_owned(),
        source_size_bytes: 2048,
        source_modified_at: modified_at,
        state: AssetMetadataState::Available,
        prompt_text: Some(r#"{"1":{"class_type":"CLIPTextEncode"}}"#.to_owned()),
        workflow_text: Some(r#"{"last_node_id":1}"#.to_owned()),
        parsed_at,
    };

    repository.upsert_png_metadata(&available).await.unwrap();

    assert_eq!(
        repository.get_png_metadata(asset_id).await.unwrap(),
        Some(available.clone())
    );

    let replacement = CachedAssetPngMetadata {
        state: AssetMetadataState::Invalid,
        prompt_text: Some("not json".to_owned()),
        workflow_text: None,
        parsed_at: Utc.with_ymd_and_hms(2026, 9, 4, 8, 2, 0).single().unwrap(),
        ..available
    };
    repository.upsert_png_metadata(&replacement).await.unwrap();

    assert_eq!(
        repository.get_png_metadata(asset_id).await.unwrap(),
        Some(replacement)
    );
}
