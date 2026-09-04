use std::path::{Path, PathBuf};

use chrono::{TimeZone, Utc};
use comfyneko_core::{
    domain::{
        asset::{AssetKind, AssetObservation, AssetRootKind, AssetScanRoot},
        asset_scan::AssetScanStatus,
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_repository::AssetRepository,
        asset_scan_repository::{AssetScanRepository, AssetScanRepositoryError},
        database::AppDatabase,
        environment_repository::EnvironmentRepository,
    },
    services::asset_discovery::{DirectoryDiscovery, DiscoveryIssue},
};
use sqlx::Row;

#[tokio::test]
async fn creates_a_sorted_deduplicated_root_snapshot_and_rejects_a_second_active_task() {
    let database = AppDatabase::connect_in_memory().await.unwrap();
    let environments = EnvironmentRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let scans = AssetScanRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let environment = EnvironmentProfile::new("主力环境", PathBuf::from(r"D:\ComfyUI"));
    environments.save_if_valid(&environment, &[]).await.unwrap();
    let roots = vec![
        scan_root(
            AssetRootKind::Workflows,
            r"D:\ComfyUI\user\default\workflows",
        ),
        scan_root(AssetRootKind::Models, r"D:\ComfyUI\models"),
        scan_root(AssetRootKind::Models, r"D:\ComfyUI\models"),
        scan_root(AssetRootKind::Input, r"D:\ComfyUI\input"),
    ];

    let task = scans.create_task(environment.id, &roots).await.unwrap();
    let roots_json: String =
        sqlx::query_scalar("SELECT roots_json FROM asset_scan_tasks WHERE id = ?")
            .bind(task.id.to_string())
            .fetch_one(database.pool())
            .await
            .unwrap();
    let stored_roots: Vec<AssetScanRoot> = serde_json::from_str(&roots_json).unwrap();
    let queued_paths: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT directory_path
        FROM asset_scan_directories
        WHERE task_id = ?
        ORDER BY root_kind, directory_path
        "#,
    )
    .bind(task.id.to_string())
    .fetch_all(database.pool())
    .await
    .unwrap();

    assert_eq!(
        stored_roots,
        vec![
            scan_root(AssetRootKind::Input, r"D:\ComfyUI\input"),
            scan_root(AssetRootKind::Models, r"D:\ComfyUI\models"),
            scan_root(
                AssetRootKind::Workflows,
                r"D:\ComfyUI\user\default\workflows"
            ),
        ]
    );
    assert_eq!(queued_paths.len(), 3);
    assert_eq!(task.status, AssetScanStatus::Queued);
    assert_eq!(task.pending_directories, 3);

    let error = scans.create_task(environment.id, &roots).await.unwrap_err();

    assert_eq!(
        error,
        AssetScanRepositoryError::ActiveTaskExists {
            environment_id: environment.id
        }
    );
}

#[tokio::test]
async fn allows_different_environments_to_keep_independent_active_tasks() {
    let database = AppDatabase::connect_in_memory().await.unwrap();
    let environments = EnvironmentRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let scans = AssetScanRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let company = EnvironmentProfile::new("公司环境", PathBuf::from(r"D:\ComfyUI"));
    let home = EnvironmentProfile::new("家里环境", PathBuf::from(r"E:\ComfyUI"));
    environments.save_if_valid(&company, &[]).await.unwrap();
    environments.save_if_valid(&home, &[]).await.unwrap();

    let company_task = scans
        .create_task(
            company.id,
            &[scan_root(AssetRootKind::Models, r"D:\ComfyUI\models")],
        )
        .await
        .unwrap();
    let home_task = scans
        .create_task(
            home.id,
            &[scan_root(AssetRootKind::Models, r"E:\ComfyUI\models")],
        )
        .await
        .unwrap();

    assert_ne!(company_task.id, home_task.id);
    assert_eq!(
        scans
            .find_active_for_environment(company.id)
            .await
            .unwrap()
            .unwrap()
            .id,
        company_task.id
    );
    assert_eq!(scans.list_tasks(home.id).await.unwrap(), vec![home_task]);
}

#[tokio::test]
async fn supports_cancel_pause_and_resume_without_changing_the_task_id() {
    let (database, environment, scans) = repository_fixture().await;
    let task = scans
        .create_task(
            environment.id,
            &[scan_root(AssetRootKind::Output, r"D:\ComfyUI\output")],
        )
        .await
        .unwrap();

    let claimed = scans.claim_next_directory(task.id).await.unwrap().unwrap();
    assert_eq!(
        scans.get_task(task.id).await.unwrap().unwrap().status,
        AssetScanStatus::Running
    );
    assert_eq!(claimed.directory_path, PathBuf::from(r"D:\ComfyUI\output"));

    let cancelling = scans.request_cancel(task.id).await.unwrap();
    assert_eq!(cancelling.status, AssetScanStatus::Cancelling);
    assert!(cancelling.can_cancel);

    let paused = scans.mark_paused(task.id).await.unwrap();
    assert_eq!(paused.status, AssetScanStatus::Paused);
    assert!(paused.can_resume);

    let resumed = scans.resume_task(task.id).await.unwrap();
    assert_eq!(resumed.id, task.id);
    assert_eq!(resumed.status, AssetScanStatus::Queued);
    assert!(resumed.can_cancel);
    assert!(!resumed.can_resume);

    let error = scans.resume_task(task.id).await.unwrap_err();
    assert!(matches!(
        error,
        AssetScanRepositoryError::InvalidTransition {
            from: AssetScanStatus::Queued,
            ..
        }
    ));

    drop(database);
}

#[tokio::test]
async fn reopening_recovers_running_work_as_interrupted_without_claiming_it_again() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("comfyneko.db");
    let task_id = {
        let database = AppDatabase::connect_file(&database_path).await.unwrap();
        let environments = EnvironmentRepository::from_pool(database.pool().clone())
            .await
            .unwrap();
        let scans = AssetScanRepository::from_pool(database.pool().clone())
            .await
            .unwrap();
        let environment = EnvironmentProfile::new("公司环境", PathBuf::from(r"D:\ComfyUI"));
        environments.save_if_valid(&environment, &[]).await.unwrap();
        let task = scans
            .create_task(
                environment.id,
                &[scan_root(AssetRootKind::Models, r"D:\ComfyUI\models")],
            )
            .await
            .unwrap();

        scans.claim_next_directory(task.id).await.unwrap().unwrap();
        task.id
    };

    let reopened = AppDatabase::connect_file(&database_path).await.unwrap();
    let scans = AssetScanRepository::from_pool(reopened.pool().clone())
        .await
        .unwrap();
    let recovered_count = scans.recover_interrupted_tasks().await.unwrap();
    let recovered = scans.get_task(task_id).await.unwrap().unwrap();
    let directory_state: String =
        sqlx::query_scalar("SELECT state FROM asset_scan_directories WHERE task_id = ?")
            .bind(task_id.to_string())
            .fetch_one(reopened.pool())
            .await
            .unwrap();

    assert_eq!(recovered_count, 1);
    assert_eq!(recovered.status, AssetScanStatus::Interrupted);
    assert!(recovered.can_resume);
    assert_eq!(recovered.current_path, None);
    assert_eq!(recovered.pending_directories, 1);
    assert_eq!(directory_state, "pending");
}

#[tokio::test]
async fn a_failed_directory_batch_rolls_back_assets_children_issues_and_checkpoint() {
    let (database, environment, scans) = repository_fixture().await;
    let assets = AssetRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let root = scan_root(AssetRootKind::Output, r"D:\ComfyUI\output");
    let task = scans
        .create_task(environment.id, std::slice::from_ref(&root))
        .await
        .unwrap();
    let claimed = scans.claim_next_directory(task.id).await.unwrap().unwrap();
    let discovery = DirectoryDiscovery {
        observations: vec![
            image_observation(
                environment.id,
                claimed.directory_path.join("valid.png"),
                128,
            ),
            image_observation(
                environment.id,
                claimed.directory_path.join("too-large.png"),
                u64::MAX,
            ),
        ],
        child_directories: vec![claimed.directory_path.join("nested")],
        issues: vec![DiscoveryIssue {
            path: claimed.directory_path.join("unreadable"),
            code: "ASSET_ENTRY_UNREADABLE".to_owned(),
            message: "测试读取失败".to_owned(),
        }],
    };

    let error = scans
        .commit_directory(task.id, &claimed, &discovery)
        .await
        .unwrap_err();
    let directory_state: String =
        sqlx::query_scalar("SELECT state FROM asset_scan_directories WHERE task_id = ?")
            .bind(task.id.to_string())
            .fetch_one(database.pool())
            .await
            .unwrap();
    let issue_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM asset_scan_issues WHERE task_id = ?")
            .bind(task.id.to_string())
            .fetch_one(database.pool())
            .await
            .unwrap();
    let refreshed = scans.get_task(task.id).await.unwrap().unwrap();

    assert!(error
        .to_string()
        .contains("asset size exceeds SQLite integer range"));
    assert!(assets
        .list_for_environment(environment.id)
        .await
        .unwrap()
        .is_empty());
    assert_eq!(directory_state, "pending");
    assert_eq!(issue_count, 0);
    assert_eq!(refreshed.processed_directories, 0);
    assert_eq!(refreshed.pending_directories, 1);
}

#[tokio::test]
async fn clean_scans_mark_only_unseen_assets_missing_and_restore_the_same_asset_id() {
    let (database, environment, scans) = repository_fixture().await;
    let root = scan_root(AssetRootKind::Output, r"D:\ComfyUI\output");
    let a_path = PathBuf::from(r"D:\ComfyUI\output\a.png");
    let b_path = PathBuf::from(r"D:\ComfyUI\output\b.png");

    complete_scan(
        &scans,
        environment.id,
        &root,
        vec![
            image_observation(environment.id, a_path.clone(), 100),
            image_observation(environment.id, b_path.clone(), 200),
        ],
    )
    .await;
    let b_before = asset_presence(database.pool(), environment.id, &b_path).await;

    complete_scan(
        &scans,
        environment.id,
        &root,
        vec![image_observation(environment.id, a_path.clone(), 100)],
    )
    .await;
    let a_missing = asset_presence(database.pool(), environment.id, &a_path).await;
    let b_missing = asset_presence(database.pool(), environment.id, &b_path).await;
    let row_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assets WHERE environment_id = ?")
        .bind(environment.id.to_string())
        .fetch_one(database.pool())
        .await
        .unwrap();

    assert_eq!(a_missing.1, 1);
    assert_eq!(b_missing.0, b_before.0);
    assert_eq!(b_missing.1, 0);
    assert!(b_missing.2.is_some());
    assert_eq!(row_count, 2);

    complete_scan(
        &scans,
        environment.id,
        &root,
        vec![
            image_observation(environment.id, a_path, 100),
            image_observation(environment.id, b_path.clone(), 200),
        ],
    )
    .await;
    let b_restored = asset_presence(database.pool(), environment.id, &b_path).await;

    assert_eq!(b_restored.0, b_before.0);
    assert_eq!(b_restored.1, 1);
    assert_eq!(b_restored.2, None);
}

#[tokio::test]
async fn scan_issues_and_changed_roots_prevent_missing_asset_reconciliation() {
    let (database, environment, scans) = repository_fixture().await;
    let root = scan_root(AssetRootKind::Output, r"D:\ComfyUI\output");
    let a_path = PathBuf::from(r"D:\ComfyUI\output\a.png");
    let b_path = PathBuf::from(r"D:\ComfyUI\output\b.png");
    complete_scan(
        &scans,
        environment.id,
        &root,
        vec![
            image_observation(environment.id, a_path.clone(), 100),
            image_observation(environment.id, b_path.clone(), 200),
        ],
    )
    .await;

    let issue_task = scans
        .create_task(environment.id, std::slice::from_ref(&root))
        .await
        .unwrap();
    let issue_claim = scans
        .claim_next_directory(issue_task.id)
        .await
        .unwrap()
        .unwrap();
    scans
        .commit_directory(
            issue_task.id,
            &issue_claim,
            &DirectoryDiscovery {
                observations: vec![image_observation(environment.id, a_path.clone(), 100)],
                child_directories: Vec::new(),
                issues: vec![DiscoveryIssue {
                    path: issue_claim.directory_path.join("blocked"),
                    code: "ASSET_ENTRY_UNREADABLE".to_owned(),
                    message: "目录不可读".to_owned(),
                }],
            },
        )
        .await
        .unwrap();
    let issue_result = scans
        .finalize_if_complete(issue_task.id, std::slice::from_ref(&root))
        .await
        .unwrap();

    assert_eq!(issue_result.status, AssetScanStatus::CompletedWithIssues);
    assert_eq!(
        asset_presence(database.pool(), environment.id, &b_path)
            .await
            .1,
        1
    );

    let changed_root_task = scans
        .create_task(environment.id, std::slice::from_ref(&root))
        .await
        .unwrap();
    let changed_root_claim = scans
        .claim_next_directory(changed_root_task.id)
        .await
        .unwrap()
        .unwrap();
    scans
        .commit_directory(
            changed_root_task.id,
            &changed_root_claim,
            &DirectoryDiscovery {
                observations: vec![image_observation(environment.id, a_path, 100)],
                child_directories: Vec::new(),
                issues: Vec::new(),
            },
        )
        .await
        .unwrap();
    let changed_root = scan_root(AssetRootKind::Output, r"D:\Different\output");
    let changed_result = scans
        .finalize_if_complete(changed_root_task.id, &[changed_root])
        .await
        .unwrap();

    assert_eq!(changed_result.status, AssetScanStatus::CompletedWithIssues);
    assert_eq!(
        scans.list_issues(changed_root_task.id).await.unwrap()[0].code,
        "SCAN_ROOTS_CHANGED"
    );
    assert_eq!(
        asset_presence(database.pool(), environment.id, &b_path)
            .await
            .1,
        1
    );
}

async fn repository_fixture() -> (AppDatabase, EnvironmentProfile, AssetScanRepository) {
    let database = AppDatabase::connect_in_memory().await.unwrap();
    let environments = EnvironmentRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let scans = AssetScanRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let environment = EnvironmentProfile::new("主力环境", PathBuf::from(r"D:\ComfyUI"));
    environments.save_if_valid(&environment, &[]).await.unwrap();

    (database, environment, scans)
}

async fn complete_scan(
    scans: &AssetScanRepository,
    environment_id: uuid::Uuid,
    root: &AssetScanRoot,
    observations: Vec<AssetObservation>,
) {
    let task = scans
        .create_task(environment_id, std::slice::from_ref(root))
        .await
        .unwrap();
    let claimed = scans.claim_next_directory(task.id).await.unwrap().unwrap();
    scans
        .commit_directory(
            task.id,
            &claimed,
            &DirectoryDiscovery {
                observations,
                child_directories: Vec::new(),
                issues: Vec::new(),
            },
        )
        .await
        .unwrap();
    let completed = scans
        .finalize_if_complete(task.id, std::slice::from_ref(root))
        .await
        .unwrap();

    assert_eq!(completed.status, AssetScanStatus::Completed);
}

async fn asset_presence(
    pool: &sqlx::SqlitePool,
    environment_id: uuid::Uuid,
    path: &Path,
) -> (String, i64, Option<String>) {
    let row = sqlx::query(
        r#"
        SELECT id, is_present, missing_since
        FROM assets
        WHERE environment_id = ? AND normalized_path = ?
        "#,
    )
    .bind(environment_id.to_string())
    .bind(path.to_string_lossy().to_string())
    .fetch_one(pool)
    .await
    .unwrap();

    (
        row.get("id"),
        row.get("is_present"),
        row.get("missing_since"),
    )
}

fn image_observation(
    environment_id: uuid::Uuid,
    path: PathBuf,
    size_bytes: u64,
) -> AssetObservation {
    AssetObservation {
        environment_id,
        root_kind: AssetRootKind::Output,
        normalized_path: path,
        kind: AssetKind::Image,
        size_bytes,
        modified_at: Some(Utc.with_ymd_and_hms(2026, 9, 4, 12, 0, 0).single().unwrap()),
    }
}

fn scan_root(kind: AssetRootKind, path: &str) -> AssetScanRoot {
    AssetScanRoot {
        kind,
        path: PathBuf::from(path),
    }
}
