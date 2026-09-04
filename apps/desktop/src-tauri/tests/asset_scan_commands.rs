use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use comfyneko_core::{
    commands::asset_scan_commands::AssetScanCommandService,
    domain::{asset_scan::AssetScanStatus, environment::EnvironmentProfile},
    repositories::{database::AppDatabase, environment_repository::EnvironmentRepository},
    services::{
        asset_discovery::{discover_directory, DirectoryDiscoveryOutcome, PreparedScanRoot},
        asset_scan_service::{AssetDirectoryScanner, AssetScanService},
    },
};
use tempfile::TempDir;
use uuid::Uuid;

#[tokio::test]
async fn returns_stable_errors_for_unknown_environments_and_empty_root_profiles() {
    let database = AppDatabase::connect_in_memory().await.unwrap();
    let service = AssetScanService::from_database(database.clone())
        .await
        .unwrap();
    let commands = AssetScanCommandService::new(service);

    let missing = commands.start(Uuid::new_v4()).await.unwrap_err();

    assert_eq!(missing.code, "ENVIRONMENT_NOT_FOUND");
    assert!(!missing.retryable);

    let environments = EnvironmentRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let empty = EnvironmentProfile::new("空目录环境", PathBuf::from(r"D:\ComfyUI"));
    environments.save_if_valid(&empty, &[]).await.unwrap();
    let no_roots = commands.start(empty.id).await.unwrap_err();

    assert_eq!(no_roots.code, "NO_SCAN_ROOTS");
    assert!(!no_roots.retryable);
}

#[tokio::test]
async fn command_service_starts_queries_cancels_resumes_and_reopens_persisted_tasks() {
    let fixture = command_fixture().await;
    let scanner = Arc::new(BlockingScanner::default());
    let service =
        AssetScanService::from_database_with_scanner(fixture.database.clone(), scanner.clone())
            .await
            .unwrap();
    let commands = AssetScanCommandService::new(service);

    let task = commands.start(fixture.environment.id).await.unwrap();
    wait_until(|| scanner.started.load(Ordering::SeqCst)).await;
    assert_eq!(commands.get(task.id).await.unwrap().id, task.id);
    assert_eq!(
        commands.list(Some(fixture.environment.id)).await.unwrap()[0].id,
        task.id
    );

    commands.cancel(task.id).await.unwrap();
    let paused = wait_for_status(&commands, task.id, AssetScanStatus::Paused).await;
    let json = serde_json::to_string(&paused).unwrap();

    assert!(json.contains(r#""status":"paused""#));
    assert!(json.contains(r#""processed_directories":"#));
    assert!(!json.contains("processedDirectories"));

    scanner.release.store(true, Ordering::SeqCst);
    let resumed = commands.resume(task.id).await.unwrap();
    let completed = wait_for_status(&commands, task.id, AssetScanStatus::Completed).await;

    assert_eq!(resumed.id, task.id);
    assert_eq!(completed.discovered_assets, 1);
    assert!(commands.issues(task.id).await.unwrap().is_empty());

    drop(commands);
    let reopened = AssetScanCommandService::connect_file(&fixture.database_path)
        .await
        .unwrap();
    let persisted = reopened.list(Some(fixture.environment.id)).await.unwrap();

    assert_eq!(persisted.len(), 1);
    assert_eq!(persisted[0].id, task.id);
    assert_eq!(persisted[0].status, AssetScanStatus::Completed);
    let invalid_resume = reopened.resume(task.id).await.unwrap_err();
    assert_eq!(invalid_resume.code, "SCAN_TASK_NOT_RESUMABLE");
}

struct CommandFixture {
    _temp_dir: TempDir,
    database_path: PathBuf,
    database: AppDatabase,
    environment: EnvironmentProfile,
}

async fn command_fixture() -> CommandFixture {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("comfyneko.db");
    let database = AppDatabase::connect_file(&database_path).await.unwrap();
    let environments = EnvironmentRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let output = temp_dir.path().join("ComfyUI").join("output");
    std::fs::create_dir_all(&output).unwrap();
    std::fs::write(output.join("result.png"), b"result").unwrap();
    let mut environment = EnvironmentProfile::new("命令环境", temp_dir.path().join("ComfyUI"));
    environment.roots.output = vec![output];
    environments.save_if_valid(&environment, &[]).await.unwrap();

    CommandFixture {
        _temp_dir: temp_dir,
        database_path,
        database,
        environment,
    }
}

async fn wait_for_status(
    commands: &AssetScanCommandService,
    task_id: Uuid,
    expected: AssetScanStatus,
) -> comfyneko_core::domain::asset_scan::AssetScanTaskSnapshot {
    for _ in 0..200 {
        let snapshot = commands.get(task_id).await.unwrap();
        if snapshot.status == expected {
            return snapshot;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    panic!("task {task_id} did not reach {}", expected.as_str());
}

async fn wait_until(predicate: impl Fn() -> bool) {
    for _ in 0..200 {
        if predicate() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    panic!("condition was not reached");
}

#[derive(Default)]
struct BlockingScanner {
    started: AtomicBool,
    release: AtomicBool,
}

impl AssetDirectoryScanner for BlockingScanner {
    fn discover(
        &self,
        environment_id: Uuid,
        root: &PreparedScanRoot,
        directory: &Path,
        cancel: &AtomicBool,
    ) -> DirectoryDiscoveryOutcome {
        self.started.store(true, Ordering::SeqCst);
        while !self.release.load(Ordering::SeqCst) {
            if cancel.load(Ordering::SeqCst) {
                return DirectoryDiscoveryOutcome::Cancelled;
            }
            thread::sleep(Duration::from_millis(5));
        }

        discover_directory(environment_id, root, directory, || {
            cancel.load(Ordering::SeqCst)
        })
    }
}
