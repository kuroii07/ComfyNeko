use std::path::PathBuf;

use chrono::{TimeZone, Utc};
use comfyneko_core::{
    domain::{
        asset::{AssetAvailability, AssetKind, AssetObservation, AssetRootKind},
        asset_thumbnail::{AssetThumbnail, AssetThumbnailState},
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_repository::AssetRepository, environment_repository::EnvironmentRepository,
    },
};
use uuid::Uuid;

#[tokio::test]
async fn gets_complete_asset_facts_by_id_and_returns_none_for_unknown_assets() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("comfyneko.db");
    let environments = EnvironmentRepository::connect_file(&database_path)
        .await
        .unwrap();
    let environment = EnvironmentProfile::new("缩略图环境", PathBuf::from(r"D:\ComfyUI"));
    environments.save_if_valid(&environment, &[]).await.unwrap();
    let assets = AssetRepository::connect_file(&database_path).await.unwrap();
    let inserted = assets
        .upsert(&AssetObservation {
            environment_id: environment.id,
            root_kind: AssetRootKind::Output,
            normalized_path: PathBuf::from(r"D:\ComfyUI\output\thumbnail-source.png"),
            kind: AssetKind::Image,
            size_bytes: 4096,
            modified_at: Some(
                Utc.with_ymd_and_hms(2026, 9, 4, 10, 30, 0)
                    .single()
                    .unwrap(),
            ),
        })
        .await
        .unwrap();

    let item = assets.get(inserted.record().id).await.unwrap().unwrap();

    assert_eq!(item.id, inserted.record().id);
    assert_eq!(item.environment_id, environment.id);
    assert_eq!(item.kind, AssetKind::Image);
    assert_eq!(item.root_kind, AssetRootKind::Output);
    assert_eq!(item.availability, AssetAvailability::Present);
    assert_eq!(item.size_bytes, 4096);
    assert!(assets.get(Uuid::new_v4()).await.unwrap().is_none());
}

#[test]
fn thumbnail_domain_states_are_stable_and_serializable() {
    let asset_id = Uuid::nil();
    let thumbnail = AssetThumbnail::ready(asset_id, PathBuf::from(r"C:\Cache\thumbnail.webp"));

    assert_eq!(thumbnail.asset_id, asset_id);
    assert_eq!(thumbnail.state, AssetThumbnailState::Ready);
    assert_eq!(
        serde_json::to_value(&thumbnail).unwrap(),
        serde_json::json!({
            "asset_id": asset_id,
            "state": "ready",
            "cache_path": r"C:\Cache\thumbnail.webp"
        })
    );
    assert_eq!(
        AssetThumbnail::unsupported(asset_id).state,
        AssetThumbnailState::Unsupported
    );
    assert_eq!(
        AssetThumbnail::unavailable(asset_id).state,
        AssetThumbnailState::Unavailable
    );
}
