use std::path::PathBuf;

use chrono::{TimeZone, Utc};
use comfyneko_core::{
    domain::{
        asset::{AssetKind, AssetObservation, AssetRootKind, AssetUpsertOutcome},
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_repository::AssetRepository, environment_repository::EnvironmentRepository,
    },
};
use tempfile::TempDir;
use uuid::Uuid;

#[tokio::test]
async fn repeating_an_observation_preserves_id_and_row_count() {
    let (temp_dir, environment) = environment_fixture("主力环境").await;
    let assets = AssetRepository::connect_file(temp_dir.path().join("comfyneko.db"))
        .await
        .unwrap();
    let observation = image_observation(environment.id, 128, fixed_time());

    let first = assets.upsert(&observation).await.unwrap();
    let second = assets.upsert(&observation).await.unwrap();
    let rows = assets.list_for_environment(environment.id).await.unwrap();

    assert!(matches!(first, AssetUpsertOutcome::Inserted(_)));
    assert!(matches!(second, AssetUpsertOutcome::Unchanged(_)));
    assert_eq!(first.record().id, second.record().id);
    assert_eq!(rows.len(), 1);
}

#[tokio::test]
async fn changed_file_facts_update_the_existing_asset() {
    let (temp_dir, environment) = environment_fixture("主力环境").await;
    let assets = AssetRepository::connect_file(temp_dir.path().join("comfyneko.db"))
        .await
        .unwrap();
    let first = image_observation(environment.id, 128, fixed_time());
    let changed = image_observation(environment.id, 256, later_time());

    let inserted = assets.upsert(&first).await.unwrap();
    let updated = assets.upsert(&changed).await.unwrap();

    assert!(matches!(inserted, AssetUpsertOutcome::Inserted(_)));
    assert!(matches!(updated, AssetUpsertOutcome::Updated(_)));
    assert_eq!(inserted.record().id, updated.record().id);
    assert_eq!(updated.record().observation.size_bytes, 256);
    assert_eq!(
        assets
            .list_for_environment(environment.id)
            .await
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn identical_paths_in_different_environments_remain_separate() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("comfyneko.db");
    let company = EnvironmentProfile::new("公司环境", PathBuf::from(r"D:\ComfyUI"));
    let home = EnvironmentProfile::new("家里环境", PathBuf::from(r"D:\ComfyUI"));
    let environments = EnvironmentRepository::connect_file(&database_path)
        .await
        .unwrap();
    environments.save_if_valid(&company, &[]).await.unwrap();
    environments.save_if_valid(&home, &[]).await.unwrap();
    let assets = AssetRepository::connect_file(&database_path).await.unwrap();

    let company_asset = assets
        .upsert(&image_observation(company.id, 128, fixed_time()))
        .await
        .unwrap();
    let home_asset = assets
        .upsert(&image_observation(home.id, 128, fixed_time()))
        .await
        .unwrap();

    assert_ne!(company_asset.record().id, home_asset.record().id);
    assert_eq!(
        assets.list_for_environment(company.id).await.unwrap().len(),
        1
    );
    assert_eq!(assets.list_for_environment(home.id).await.unwrap().len(), 1);
}

#[tokio::test]
async fn rejects_asset_sizes_that_exceed_sqlite_integer_range() {
    let (temp_dir, environment) = environment_fixture("超大文件环境").await;
    let assets = AssetRepository::connect_file(temp_dir.path().join("comfyneko.db"))
        .await
        .unwrap();
    let observation = image_observation(environment.id, u64::MAX, fixed_time());

    let error = assets.upsert(&observation).await.unwrap_err();

    assert!(error
        .to_string()
        .contains("asset size exceeds SQLite integer range"));
    assert!(assets
        .list_for_environment(environment.id)
        .await
        .unwrap()
        .is_empty());
}

async fn environment_fixture(name: &str) -> (TempDir, EnvironmentProfile) {
    let temp_dir = tempfile::tempdir().unwrap();
    let repository = EnvironmentRepository::connect_file(temp_dir.path().join("comfyneko.db"))
        .await
        .unwrap();
    let environment = EnvironmentProfile::new(name, PathBuf::from(r"D:\ComfyUI"));
    repository.save_if_valid(&environment, &[]).await.unwrap();

    (temp_dir, environment)
}

fn image_observation(
    environment_id: Uuid,
    size_bytes: u64,
    modified_at: chrono::DateTime<Utc>,
) -> AssetObservation {
    AssetObservation {
        environment_id,
        root_kind: AssetRootKind::Output,
        normalized_path: PathBuf::from(r"D:\ComfyUI\output\result.png"),
        kind: AssetKind::Image,
        size_bytes,
        modified_at: Some(modified_at),
    }
}

fn fixed_time() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 3, 10, 0, 0).single().unwrap()
}

fn later_time() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 3, 10, 5, 0).single().unwrap()
}
