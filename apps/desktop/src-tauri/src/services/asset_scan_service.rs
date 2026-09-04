use std::{
    collections::HashMap,
    error::Error,
    fmt, fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use uuid::Uuid;

use crate::{
    domain::{
        asset::{AssetRootKind, AssetScanRoot},
        asset_scan::{AssetScanIssue, AssetScanStatus, AssetScanTaskSnapshot},
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_scan_repository::{AssetScanRepository, AssetScanRepositoryError},
        database::{AppDatabase, AppDatabaseError},
        environment_repository::{EnvironmentRepository, RepositoryError},
    },
};

use super::asset_discovery::{discover_directory, DirectoryDiscoveryOutcome, PreparedScanRoot};

pub trait AssetDirectoryScanner: Send + Sync {
    fn discover(
        &self,
        environment_id: Uuid,
        root: &PreparedScanRoot,
        directory: &Path,
        cancel: &AtomicBool,
    ) -> DirectoryDiscoveryOutcome;
}

#[derive(Default)]
pub struct FilesystemAssetDirectoryScanner;

impl AssetDirectoryScanner for FilesystemAssetDirectoryScanner {
    fn discover(
        &self,
        environment_id: Uuid,
        root: &PreparedScanRoot,
        directory: &Path,
        cancel: &AtomicBool,
    ) -> DirectoryDiscoveryOutcome {
        discover_directory(environment_id, root, directory, || {
            cancel.load(Ordering::SeqCst)
        })
    }
}

#[derive(Clone)]
pub struct AssetScanService {
    environments: EnvironmentRepository,
    scans: AssetScanRepository,
    scanner: Arc<dyn AssetDirectoryScanner>,
    workers: Arc<Mutex<HashMap<Uuid, Arc<AtomicBool>>>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AssetScanServiceError {
    EnvironmentNotFound {
        environment_id: Uuid,
    },
    TaskNotFound {
        task_id: Uuid,
    },
    TaskNotResumable {
        task_id: Uuid,
        status: AssetScanStatus,
    },
    NoScanRoots {
        environment_id: Uuid,
    },
    InvalidScanRoot {
        path: PathBuf,
        message: String,
    },
    Database(String),
    WorkerState(String),
}

impl AssetScanService {
    pub async fn connect_file(path: impl AsRef<Path>) -> Result<Self, AssetScanServiceError> {
        let database = AppDatabase::connect_file(path)
            .await
            .map_err(AssetScanServiceError::database)?;
        Self::from_database(database).await
    }

    pub async fn from_database(database: AppDatabase) -> Result<Self, AssetScanServiceError> {
        Self::from_database_with_scanner(database, Arc::new(FilesystemAssetDirectoryScanner)).await
    }

    pub async fn from_database_with_scanner(
        database: AppDatabase,
        scanner: Arc<dyn AssetDirectoryScanner>,
    ) -> Result<Self, AssetScanServiceError> {
        let environments = EnvironmentRepository::from_pool(database.pool().clone())
            .await
            .map_err(AssetScanServiceError::environment_repository)?;
        let scans = AssetScanRepository::from_pool(database.pool().clone())
            .await
            .map_err(AssetScanServiceError::scan_repository)?;

        Ok(Self {
            environments,
            scans,
            scanner,
            workers: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn start(
        &self,
        environment_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, AssetScanServiceError> {
        if let Some(existing) = self
            .scans
            .find_active_for_environment(environment_id)
            .await
            .map_err(AssetScanServiceError::scan_repository)?
        {
            if matches!(
                existing.status,
                AssetScanStatus::Queued | AssetScanStatus::Running
            ) {
                self.spawn_worker(existing.id)?;
            }
            return Ok(existing);
        }

        let environment = self
            .environments
            .get(environment_id)
            .await
            .map_err(AssetScanServiceError::environment_repository)?
            .ok_or(AssetScanServiceError::EnvironmentNotFound { environment_id })?;
        let roots = prepare_roots_strict(&environment)?;
        let task = match self.scans.create_task(environment_id, &roots).await {
            Ok(task) => task,
            Err(AssetScanRepositoryError::ActiveTaskExists { .. }) => self
                .scans
                .find_active_for_environment(environment_id)
                .await
                .map_err(AssetScanServiceError::scan_repository)?
                .ok_or_else(|| {
                    AssetScanServiceError::WorkerState(
                        "active scan constraint fired without an active task".to_owned(),
                    )
                })?,
            Err(error) => return Err(AssetScanServiceError::scan_repository(error)),
        };
        if task.status == AssetScanStatus::Queued {
            self.spawn_worker(task.id)?;
        }

        Ok(task)
    }

    pub async fn cancel(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, AssetScanServiceError> {
        let snapshot = self
            .scans
            .request_cancel(task_id)
            .await
            .map_err(AssetScanServiceError::scan_repository)?;
        if snapshot.status != AssetScanStatus::Cancelling {
            return Ok(snapshot);
        }

        let token = self
            .workers
            .lock()
            .map_err(AssetScanServiceError::worker_lock)?
            .get(&task_id)
            .cloned();
        if let Some(token) = token {
            token.store(true, Ordering::SeqCst);
            Ok(snapshot)
        } else {
            self.scans
                .mark_paused(task_id)
                .await
                .map_err(AssetScanServiceError::scan_repository)
        }
    }

    pub async fn resume(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, AssetScanServiceError> {
        let task = self
            .scans
            .resume_task(task_id)
            .await
            .map_err(AssetScanServiceError::scan_repository)?;
        self.spawn_worker(task_id)?;

        Ok(task)
    }

    pub async fn get(&self, task_id: Uuid) -> Result<AssetScanTaskSnapshot, AssetScanServiceError> {
        self.scans
            .get_task(task_id)
            .await
            .map_err(AssetScanServiceError::scan_repository)?
            .ok_or(AssetScanServiceError::TaskNotFound { task_id })
    }

    pub async fn list(
        &self,
        environment_id: Option<Uuid>,
    ) -> Result<Vec<AssetScanTaskSnapshot>, AssetScanServiceError> {
        match environment_id {
            Some(environment_id) => self
                .scans
                .list_tasks(environment_id)
                .await
                .map_err(AssetScanServiceError::scan_repository),
            None => self
                .scans
                .list_all_tasks()
                .await
                .map_err(AssetScanServiceError::scan_repository),
        }
    }

    pub async fn issues(
        &self,
        task_id: Uuid,
    ) -> Result<Vec<AssetScanIssue>, AssetScanServiceError> {
        self.scans
            .list_issues(task_id)
            .await
            .map_err(AssetScanServiceError::scan_repository)
    }

    pub async fn recover_interrupted(&self) -> Result<u64, AssetScanServiceError> {
        self.scans
            .recover_interrupted_tasks()
            .await
            .map_err(AssetScanServiceError::scan_repository)
    }

    fn spawn_worker(&self, task_id: Uuid) -> Result<bool, AssetScanServiceError> {
        let token = Arc::new(AtomicBool::new(false));
        {
            let mut workers = self
                .workers
                .lock()
                .map_err(AssetScanServiceError::worker_lock)?;
            if let Some(existing) = workers.get(&task_id) {
                if !existing.load(Ordering::SeqCst) {
                    return Ok(false);
                }
            }
            workers.insert(task_id, token.clone());
        }

        let service = self.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = service.run_worker(task_id, token.clone()).await {
                token.store(true, Ordering::SeqCst);
                let _ = service
                    .scans
                    .mark_failed(task_id, "SCAN_WORKER_ERROR", &error.to_string())
                    .await;
            }
            service.remove_worker(task_id, &token);
        });

        Ok(true)
    }

    async fn run_worker(
        &self,
        task_id: Uuid,
        cancel: Arc<AtomicBool>,
    ) -> Result<(), AssetScanServiceError> {
        let environment_id = self.get(task_id).await?.environment_id;
        loop {
            if cancel.load(Ordering::SeqCst) {
                self.pause_after_cancel(task_id).await?;
                return Ok(());
            }

            let claimed = self
                .scans
                .claim_next_directory(task_id)
                .await
                .map_err(AssetScanServiceError::scan_repository)?;
            let Some(claimed) = claimed else {
                let task = self.get(task_id).await?;
                if task.status == AssetScanStatus::Cancelling {
                    self.pause_after_cancel(task_id).await?;
                    return Ok(());
                }
                if !matches!(
                    task.status,
                    AssetScanStatus::Queued | AssetScanStatus::Running
                ) {
                    return Ok(());
                }

                cancel.store(true, Ordering::SeqCst);
                let current_roots = self.current_roots_for_finalization(environment_id).await;
                self.scans
                    .finalize_if_complete(task_id, &current_roots)
                    .await
                    .map_err(AssetScanServiceError::scan_repository)?;
                return Ok(());
            };

            let root = PreparedScanRoot {
                kind: claimed.root_kind,
                path: claimed.root_path.clone(),
            };
            let directory = claimed.directory_path.clone();
            let scanner = self.scanner.clone();
            let scan_cancel = cancel.clone();
            let outcome = tokio::task::spawn_blocking(move || {
                scanner.discover(environment_id, &root, &directory, &scan_cancel)
            })
            .await
            .map_err(|error| {
                AssetScanServiceError::WorkerState(format!(
                    "directory scanner task failed: {error}"
                ))
            })?;

            if cancel.load(Ordering::SeqCst) || outcome == DirectoryDiscoveryOutcome::Cancelled {
                self.pause_after_cancel(task_id).await?;
                return Ok(());
            }

            let DirectoryDiscoveryOutcome::Completed(discovery) = outcome else {
                unreachable!("cancelled outcomes return before commit");
            };
            self.scans
                .commit_directory(task_id, &claimed, &discovery)
                .await
                .map_err(AssetScanServiceError::scan_repository)?;
        }
    }

    async fn pause_after_cancel(&self, task_id: Uuid) -> Result<(), AssetScanServiceError> {
        let snapshot = self
            .scans
            .request_cancel(task_id)
            .await
            .map_err(AssetScanServiceError::scan_repository)?;
        if snapshot.status == AssetScanStatus::Cancelling {
            self.scans
                .mark_paused(task_id)
                .await
                .map_err(AssetScanServiceError::scan_repository)?;
        }

        Ok(())
    }

    async fn current_roots_for_finalization(&self, environment_id: Uuid) -> Vec<AssetScanRoot> {
        let Ok(Some(environment)) = self.environments.get(environment_id).await else {
            return Vec::new();
        };

        prepare_roots_lenient(&environment)
    }

    fn remove_worker(&self, task_id: Uuid, token: &Arc<AtomicBool>) {
        let Ok(mut workers) = self.workers.lock() else {
            return;
        };
        if workers
            .get(&task_id)
            .is_some_and(|existing| Arc::ptr_eq(existing, token))
        {
            workers.remove(&task_id);
        }
    }
}

fn prepare_roots_strict(
    environment: &EnvironmentProfile,
) -> Result<Vec<AssetScanRoot>, AssetScanServiceError> {
    let configured = configured_roots(environment);
    if configured.is_empty() {
        return Err(AssetScanServiceError::NoScanRoots {
            environment_id: environment.id,
        });
    }

    let mut prepared = Vec::with_capacity(configured.len());
    for root in configured {
        let metadata =
            fs::metadata(&root.path).map_err(|error| AssetScanServiceError::InvalidScanRoot {
                path: root.path.clone(),
                message: error.to_string(),
            })?;
        if !metadata.is_dir() {
            return Err(AssetScanServiceError::InvalidScanRoot {
                path: root.path,
                message: "configured asset root is not a directory".to_owned(),
            });
        }
        let path = dunce::canonicalize(&root.path).map_err(|error| {
            AssetScanServiceError::InvalidScanRoot {
                path: root.path.clone(),
                message: error.to_string(),
            }
        })?;
        prepared.push(AssetScanRoot {
            kind: root.kind,
            path,
        });
    }

    Ok(sorted_unique_roots(prepared))
}

fn prepare_roots_lenient(environment: &EnvironmentProfile) -> Vec<AssetScanRoot> {
    let roots = configured_roots(environment)
        .into_iter()
        .filter_map(|root| {
            let metadata = fs::metadata(&root.path).ok()?;
            if !metadata.is_dir() {
                return None;
            }
            Some(AssetScanRoot {
                kind: root.kind,
                path: dunce::canonicalize(root.path).ok()?,
            })
        })
        .collect();

    sorted_unique_roots(roots)
}

fn configured_roots(environment: &EnvironmentProfile) -> Vec<AssetScanRoot> {
    let mut roots = Vec::new();
    roots.extend(
        environment
            .roots
            .models
            .iter()
            .cloned()
            .map(|path| AssetScanRoot {
                kind: AssetRootKind::Models,
                path,
            }),
    );
    roots.extend(
        environment
            .roots
            .input
            .iter()
            .cloned()
            .map(|path| AssetScanRoot {
                kind: AssetRootKind::Input,
                path,
            }),
    );
    roots.extend(
        environment
            .roots
            .output
            .iter()
            .cloned()
            .map(|path| AssetScanRoot {
                kind: AssetRootKind::Output,
                path,
            }),
    );
    roots.extend(
        environment
            .roots
            .workflows
            .iter()
            .cloned()
            .map(|path| AssetScanRoot {
                kind: AssetRootKind::Workflows,
                path,
            }),
    );
    roots
}

fn sorted_unique_roots(mut roots: Vec<AssetScanRoot>) -> Vec<AssetScanRoot> {
    roots.sort_by(|left, right| {
        left.kind.as_str().cmp(right.kind.as_str()).then_with(|| {
            left.path
                .to_string_lossy()
                .cmp(&right.path.to_string_lossy())
        })
    });
    roots.dedup_by(|left, right| left.kind == right.kind && left.path == right.path);
    roots
}

impl AssetScanServiceError {
    fn database(error: AppDatabaseError) -> Self {
        Self::Database(error.to_string())
    }

    fn environment_repository(error: RepositoryError) -> Self {
        Self::Database(error.to_string())
    }

    fn scan_repository(error: AssetScanRepositoryError) -> Self {
        match error {
            AssetScanRepositoryError::TaskNotFound { task_id } => Self::TaskNotFound { task_id },
            AssetScanRepositoryError::InvalidTransition { task_id, from, .. } => {
                Self::TaskNotResumable {
                    task_id,
                    status: from,
                }
            }
            other => Self::Database(other.to_string()),
        }
    }

    fn worker_lock(error: impl fmt::Display) -> Self {
        Self::WorkerState(format!("scan worker registry is unavailable: {error}"))
    }
}

impl fmt::Display for AssetScanServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EnvironmentNotFound { environment_id } => {
                write!(formatter, "未找到环境档案：{environment_id}")
            }
            Self::TaskNotFound { task_id } => write!(formatter, "未找到扫描任务：{task_id}"),
            Self::TaskNotResumable { task_id, status } => write!(
                formatter,
                "扫描任务 {task_id} 当前状态 {} 不能继续",
                status.as_str()
            ),
            Self::NoScanRoots { environment_id } => {
                write!(formatter, "环境 {environment_id} 没有可扫描的资产目录")
            }
            Self::InvalidScanRoot { path, message } => {
                write!(formatter, "资产目录不可用 {}：{message}", path.display())
            }
            Self::Database(message) | Self::WorkerState(message) => formatter.write_str(message),
        }
    }
}

impl Error for AssetScanServiceError {}
