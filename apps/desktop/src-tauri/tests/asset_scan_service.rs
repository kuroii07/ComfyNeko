use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use comfyneko_core::{
    domain::{
        asset::{AssetRootKind, AssetScanRoot},
        asset_scan::{AssetScanStatus, AssetScanTaskSnapshot},
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_scan_repository::AssetScanRepository, database::AppDatabase,
        environment_repository::EnvironmentRepository,
    },
    services::{
        asset_discovery::{discover_directory, DirectoryDiscoveryOutcome, PreparedScanRoot},
        asset_scan_service::{AssetDirectoryScanner, AssetScanService},
    },
};
use tempfile::TempDir;
use uuid::Uuid;

#[tokio::test]
async fn start_returns_before_scan_completion_and_reuses_one_worker_for_duplicate_start() {
    let fixture = service_fixture().await;
    let scanner = Arc::new(GateScanner::default());
    let service =
        AssetScanService::from_database_with_scanner(fixture.database.clone(), scanner.clone())
            .await
            .unwrap();

    let first = service.start(fixture.environment.id).await.unwrap();
    wait_until(|| scanner.started.load(Ordering::SeqCst)).await;
    let duplicate = service.start(fixture.environment.id).await.unwrap();

    assert_eq!(duplicate.id, first.id);
    assert!(matches!(
        service.get(first.id).await.unwrap().status,
        AssetScanStatus::Queued | AssetScanStatus::Running
    ));
    assert_eq!(scanner.max_active.load(Ordering::SeqCst), 1);

    scanner.release.store(true, Ordering::SeqCst);
    let completed = wait_for_status(&service, first.id, AssetScanStatus::Completed).await;

    assert!(completed.processed_directories >= 2);
    assert_eq!(completed.discovered_assets, 2);
    assert_eq!(scanner.max_active.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn cancel_keeps_pending_work_and_resume_finishes_with_the_same_task_id() {
    let fixture = service_fixture().await;
    let scanner = Arc::new(GateScanner::default());
    let service =
        AssetScanService::from_database_with_scanner(fixture.database.clone(), scanner.clone())
            .await
            .unwrap();
    let task = service.start(fixture.environment.id).await.unwrap();
    wait_until(|| scanner.started.load(Ordering::SeqCst)).await;

    service.cancel(task.id).await.unwrap();
    let paused = wait_for_status(&service, task.id, AssetScanStatus::Paused).await;
    let processed_at_pause = paused.processed_directories;
    tokio::time::sleep(Duration::from_millis(80)).await;
    let still_paused = service.get(task.id).await.unwrap();

    assert_eq!(still_paused.status, AssetScanStatus::Paused);
    assert_eq!(still_paused.processed_directories, processed_at_pause);
    assert!(still_paused.pending_directories > 0);

    scanner.release.store(true, Ordering::SeqCst);
    let resumed = service.resume(task.id).await.unwrap();
    let completed = wait_for_status(&service, task.id, AssetScanStatus::Completed).await;

    assert_eq!(resumed.id, task.id);
    assert_eq!(completed.id, task.id);
    assert_eq!(completed.discovered_assets, 2);
    assert_eq!(scanner.max_active.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn restart_recovery_marks_running_work_interrupted_without_starting_the_scanner() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("comfyneko.db");
    let root = create_asset_tree(&temp_dir);
    let task_id = {
        let database = AppDatabase::connect_file(&database_path).await.unwrap();
        let environments = EnvironmentRepository::from_pool(database.pool().clone())
            .await
            .unwrap();
        let scans = AssetScanRepository::from_pool(database.pool().clone())
            .await
            .unwrap();
        let mut environment = EnvironmentProfile::new("重启环境", temp_dir.path().join("ComfyUI"));
        environment.roots.output = vec![root.clone()];
        environments.save_if_valid(&environment, &[]).await.unwrap();
        let task = scans
            .create_task(
                environment.id,
                &[AssetScanRoot {
                    kind: AssetRootKind::Output,
                    path: dunce::canonicalize(&root).unwrap(),
                }],
            )
            .await
            .unwrap();
        scans.claim_next_directory(task.id).await.unwrap().unwrap();
        task.id
    };
    let scanner = Arc::new(GateScanner {
        release: AtomicBool::new(true),
        ..GateScanner::default()
    });
    let reopened = AppDatabase::connect_file(&database_path).await.unwrap();
    let service = AssetScanService::from_database_with_scanner(reopened, scanner.clone())
        .await
        .unwrap();

    assert_eq!(service.recover_interrupted().await.unwrap(), 1);
    tokio::time::sleep(Duration::from_millis(80)).await;
    let recovered = service.get(task_id).await.unwrap();

    assert_eq!(recovered.status, AssetScanStatus::Interrupted);
    assert!(recovered.can_resume);
    assert_eq!(scanner.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn scanner_panics_are_persisted_as_failed_tasks_instead_of_crashing_the_service() {
    let fixture = service_fixture().await;
    let service = AssetScanService::from_database_with_scanner(
        fixture.database.clone(),
        Arc::new(PanicScanner),
    )
    .await
    .unwrap();

    let task = service.start(fixture.environment.id).await.unwrap();
    let failed = wait_for_status(&service, task.id, AssetScanStatus::Failed).await;

    assert_eq!(
        failed.error.as_ref().map(|error| error.code.as_str()),
        Some("SCAN_WORKER_ERROR")
    );
    assert!(failed.pending_directories > 0);
}

struct ServiceFixture {
    _temp_dir: TempDir,
    database: AppDatabase,
    environment: EnvironmentProfile,
}

async fn service_fixture() -> ServiceFixture {
    let temp_dir = tempfile::tempdir().unwrap();
    let database = AppDatabase::connect_file(temp_dir.path().join("comfyneko.db"))
        .await
        .unwrap();
    let environments = EnvironmentRepository::from_pool(database.pool().clone())
        .await
        .unwrap();
    let root = create_asset_tree(&temp_dir);
    let mut environment = EnvironmentProfile::new("测试环境", temp_dir.path().join("ComfyUI"));
    environment.roots.output = vec![root];
    environments.save_if_valid(&environment, &[]).await.unwrap();

    ServiceFixture {
        _temp_dir: temp_dir,
        database,
        environment,
    }
}

fn create_asset_tree(temp_dir: &TempDir) -> PathBuf {
    let root = temp_dir.path().join("ComfyUI").join("output");
    let nested = root.join("nested");
    std::fs::create_dir_all(&nested).unwrap();
    std::fs::write(root.join("root.png"), b"root").unwrap();
    std::fs::write(nested.join("nested.png"), b"nested").unwrap();
    root
}

async fn wait_for_status(
    service: &AssetScanService,
    task_id: Uuid,
    expected: AssetScanStatus,
) -> AssetScanTaskSnapshot {
    for _ in 0..200 {
        let snapshot = service.get(task_id).await.unwrap();
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
struct GateScanner {
    started: AtomicBool,
    release: AtomicBool,
    calls: AtomicUsize,
    active: AtomicUsize,
    max_active: AtomicUsize,
}

impl AssetDirectoryScanner for GateScanner {
    fn discover(
        &self,
        environment_id: Uuid,
        root: &PreparedScanRoot,
        directory: &Path,
        cancel: &AtomicBool,
    ) -> DirectoryDiscoveryOutcome {
        self.started.store(true, Ordering::SeqCst);
        self.calls.fetch_add(1, Ordering::SeqCst);
        let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
        self.max_active.fetch_max(active, Ordering::SeqCst);

        while !self.release.load(Ordering::SeqCst) {
            if cancel.load(Ordering::SeqCst) {
                self.active.fetch_sub(1, Ordering::SeqCst);
                return DirectoryDiscoveryOutcome::Cancelled;
            }
            thread::sleep(Duration::from_millis(5));
        }

        let outcome = discover_directory(environment_id, root, directory, || {
            cancel.load(Ordering::SeqCst)
        });
        self.active.fetch_sub(1, Ordering::SeqCst);
        outcome
    }
}

struct PanicScanner;

impl AssetDirectoryScanner for PanicScanner {
    fn discover(
        &self,
        _environment_id: Uuid,
        _root: &PreparedScanRoot,
        _directory: &Path,
        _cancel: &AtomicBool,
    ) -> DirectoryDiscoveryOutcome {
        panic!("controlled scanner panic");
    }
}
