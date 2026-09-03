# Persistent Scan Task Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent full-environment scan jobs with a SQLite directory queue, cooperative cancellation, explicit resume, safe missing-asset finalization, Tauri commands/events, and a minimal scan-task panel for manual testing.

**Architecture:** A versioned migration runner creates task tables and asset scan markers. `ScanTaskRepository` owns durable state transitions and directory transactions; `ScanTaskService` orchestrates read-only discovery one directory at a time. Thin Tauri commands start workers and emit `scan://progress`; the React scan-task page consumes those commands without gaining arbitrary filesystem access.

**Tech Stack:** Rust 2021, Tokio, SQLx SQLite, Tauri 2, React 19, TypeScript, Vitest, Testing Library, Lucide React.

**Spec:** `docs/superpowers/specs/2026-09-03-scan-task-runtime-design.md`

## Global Constraints

- A scan may read only roots stored in a saved `EnvironmentProfile`.
- Application startup converts interrupted jobs to paused and never resumes disk scanning automatically.
- Cancellation finishes or rolls back the current directory transaction, then pauses before claiming more work.
- Paused and failed scans never mark assets missing.
- Only a successful full-environment scan may mark unseen assets missing.
- One environment may have only one queued, running, or paused job.
- Do not follow directory symlinks or path escapes.
- Do not add hashing, thumbnails, metadata parsing, file watching, asset grids, tags, search, or model subtyping.
- Record deferred model subtyping as Checkpoint, Diffusion Model, LoRA, VAE, Text Encoder, and related categories; do not implement it here.
- After every task, run its automated checks, rebuild the Tauri debug executable, open the visible app, describe the manual checks, and pause for user feedback.
- Do not use Computer Use; the user operates the visible application.

---

### Task 1: Add Versioned Migrations and Scan Domain Types

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0003_scan_tasks.sql`
- Modify: `apps/desktop/src-tauri/src/repositories/migrations.rs`
- Create: `apps/desktop/src-tauri/src/domain/scan.rs`
- Modify: `apps/desktop/src-tauri/src/domain/mod.rs`
- Test: `apps/desktop/src-tauri/src/repositories/migrations.rs`
- Test: `apps/desktop/src-tauri/src/domain/scan.rs`

**Interfaces:**
- Produces:

```rust
pub enum ScanJobStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
}

pub enum ScanPauseReason {
    UserRequested,
    ApplicationInterrupted,
}

pub enum ScanQueueState {
    Pending,
    Processing,
    Completed,
}

pub struct ScanJob {
    pub id: Uuid,
    pub environment_id: Uuid,
    pub status: ScanJobStatus,
    pub pause_reason: Option<ScanPauseReason>,
    pub cancel_requested: bool,
    pub queued_directories: u64,
    pub completed_directories: u64,
    pub discovered_assets: u64,
    pub issue_count: u64,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

pub struct ScanRootSnapshot {
    pub id: i64,
    pub job_id: Uuid,
    pub root_kind: AssetRootKind,
    pub configured_path: PathBuf,
    pub canonical_path: Option<PathBuf>,
}

pub struct ScanDirectoryWork {
    pub queue_id: i64,
    pub job_id: Uuid,
    pub scan_root: ScanRootSnapshot,
    pub directory_path: PathBuf,
}
```

- [ ] **Step 1: Write failing migration and serialization tests**

Migration test:

```rust
#[tokio::test]
async fn migrations_apply_once_and_survive_reopen() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("comfyneko.db");

    let first = test_pool(&database_path).await;
    run(&first).await.unwrap();
    drop(first);

    let reopened = test_pool(&database_path).await;
    run(&reopened).await.unwrap();

    let versions: Vec<i64> = sqlx::query_scalar(
        "SELECT version FROM schema_migrations ORDER BY version"
    )
    .fetch_all(&reopened)
    .await
    .unwrap();
    assert_eq!(versions, vec![1, 2, 3]);
}
```

Domain test:

```rust
#[test]
fn scan_job_round_trips_with_a_pause_reason() {
    let job = paused_job_fixture();
    let encoded = serde_json::to_string(&job).unwrap();
    let decoded: ScanJob = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded, job);
    assert!(encoded.contains("\"status\":\"paused\""));
    assert!(encoded.contains("\"pause_reason\":\"application_interrupted\""));
}
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core migrations_apply_once_and_survive_reopen
cargo test -p comfyneko-core scan_job_round_trips_with_a_pause_reason
```

Expected: compilation fails because versioned migrations and `domain::scan` do not exist.

- [ ] **Step 3: Implement the migration ledger**

Replace unconditional migration execution with:

```rust
struct Migration {
    version: i64,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration { version: 1, sql: include_str!("../../migrations/0001_environments.sql") },
    Migration { version: 2, sql: include_str!("../../migrations/0002_assets.sql") },
    Migration { version: 3, sql: include_str!("../../migrations/0003_scan_tasks.sql") },
];
```

`run(pool)` must:

1. create `schema_migrations`;
2. check each version;
3. begin one transaction per unapplied migration;
4. execute its complete SQL script;
5. insert the applied version and UTC timestamp;
6. commit;
7. safely run again without re-executing `ALTER TABLE`.

- [ ] **Step 4: Implement exact scan schema**

`0003_scan_tasks.sql` contains:

- `scan_jobs`;
- partial unique open-job index;
- `scan_roots` with `configured_path` and nullable `canonical_path`;
- `scan_queue` referencing `scan_root_id`;
- `scan_issues`;
- `last_seen_scan_id`, `availability`, and `missing_since` columns on `assets`;
- indexes for job status, queue state, issue lookup, and asset availability.

- [ ] **Step 5: Implement serializable scan domain types**

Derive `Debug`, `Clone`, `PartialEq`, `Eq`, `Serialize`, and `Deserialize`. Use `snake_case` enum serialization and exact `as_str` / `parse` methods for database conversion.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
cargo fmt --check
cargo test -p comfyneko-core migrations::tests
cargo test -p comfyneko-core domain::scan::tests
cargo test -p comfyneko-core
```

- [ ] **Step 7: Commit the migration checkpoint**

```powershell
git add apps/desktop/src-tauri/migrations apps/desktop/src-tauri/src/domain apps/desktop/src-tauri/src/repositories/migrations.rs docs/superpowers
git commit -m "feat(scan): add persistent scan task schema"
```

- [ ] **Step 8: Build, open, and pause for manual test**

Run:

```powershell
pnpm.cmd --dir apps/desktop exec tauri build --debug --no-bundle
Start-Process -FilePath (Resolve-Path 'target/debug/comfyneko.exe')
```

Manual check:

- the application opens normally;
- the environment page still loads saved environments;
- no scan starts automatically;
- no new visible UI is expected in this checkpoint.

Pause until the user reports the result.

---

### Task 2: Add Scan Job Repository and Startup Recovery

**Files:**
- Create: `apps/desktop/src-tauri/src/repositories/scan_task_repository.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/mod.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/environment_repository.rs`
- Create: `apps/desktop/src-tauri/tests/scan_task_repository.rs`

**Interfaces:**
- Produces:

```rust
#[derive(Clone)]
pub struct ScanTaskRepository {
    pool: SqlitePool,
}

impl ScanTaskRepository {
    pub async fn connect_file(path: impl AsRef<Path>) -> Result<Self, ScanTaskError>;
    pub async fn create_job(
        &self,
        environment_id: Uuid,
        roots: &[AssetScanRoot],
    ) -> Result<ScanJob, ScanTaskError>;
    pub async fn get_job(&self, job_id: Uuid) -> Result<ScanJob, ScanTaskError>;
    pub async fn list_jobs(
        &self,
        environment_id: Option<Uuid>,
    ) -> Result<Vec<ScanJob>, ScanTaskError>;
    pub async fn request_cancel(&self, job_id: Uuid) -> Result<ScanJob, ScanTaskError>;
    pub async fn resume_job(&self, job_id: Uuid) -> Result<ScanJob, ScanTaskError>;
    pub async fn recover_interrupted_jobs(&self) -> Result<Vec<ScanJob>, ScanTaskError>;
    pub async fn claim_next_directory(
        &self,
        job_id: Uuid,
    ) -> Result<Option<ScanDirectoryWork>, ScanTaskError>;
}
```

Add:

```rust
pub async fn get(
    &self,
    environment_id: Uuid,
) -> Result<Option<EnvironmentProfile>, RepositoryError>;
```

- [ ] **Step 1: Write failing repository tests**

Tests must prove:

```rust
#[tokio::test]
async fn starting_a_job_snapshots_every_configured_asset_root() {
    let fixture = scan_repository_fixture().await;
    let job = fixture.repository
        .create_job(fixture.environment.id, &fixture.roots)
        .await
        .unwrap();

    assert_eq!(job.status, ScanJobStatus::Queued);
    assert_eq!(job.queued_directories, fixture.roots.len() as u64);
    assert_eq!(fixture.repository.list_roots(job.id).await.unwrap().len(), fixture.roots.len());
}

#[tokio::test]
async fn rejects_a_second_open_job_for_the_same_environment() {
    let fixture = scan_repository_fixture().await;
    fixture.repository
        .create_job(fixture.environment.id, &fixture.roots)
        .await
        .unwrap();

    let error = fixture.repository
        .create_job(fixture.environment.id, &fixture.roots)
        .await
        .unwrap_err();

    assert_eq!(error.code(), "SCAN_JOB_ALREADY_OPEN");
}

#[tokio::test]
async fn startup_recovery_pauses_running_jobs_without_scanning() {
    let fixture = running_job_fixture().await;
    let recovered = fixture.repository.recover_interrupted_jobs().await.unwrap();

    assert_eq!(recovered[0].status, ScanJobStatus::Paused);
    assert_eq!(
        recovered[0].pause_reason,
        Some(ScanPauseReason::ApplicationInterrupted)
    );
    assert_eq!(fixture.repository.pending_directory_count(recovered[0].id).await.unwrap(), 1);
}
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core --test scan_task_repository
```

Expected: compilation fails because `ScanTaskRepository` does not exist.

- [ ] **Step 3: Implement job creation and root snapshots**

Within one transaction:

1. insert the queued job;
2. insert one `scan_roots` row per supplied root;
3. insert one pending root directory per snapshot;
4. set `queued_directories` to the inserted queue count;
5. map the partial unique-index violation to `SCAN_JOB_ALREADY_OPEN`.

Reject an empty root list with `SCAN_ROOTS_EMPTY`.

- [ ] **Step 4: Implement lifecycle methods**

- `request_cancel`: valid only for queued/running jobs; sets `cancel_requested = 1`.
- `resume_job`: valid only for paused jobs; clears cancellation and pause reason, sets queued.
- `recover_interrupted_jobs`: resets processing queue rows to pending and running jobs to paused with `ApplicationInterrupted`.
- `claim_next_directory`: checks cancellation, transitions queued to running, claims the oldest pending row, and returns its root snapshot.
- Invalid transitions return `SCAN_STATE_INVALID`.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
cargo fmt --check
cargo clippy -p comfyneko-core --all-targets -- -D warnings
cargo test -p comfyneko-core --test scan_task_repository
cargo test -p comfyneko-core
```

- [ ] **Step 6: Commit the repository checkpoint**

```powershell
git add apps/desktop/src-tauri/src/repositories apps/desktop/src-tauri/tests/scan_task_repository.rs docs/superpowers
git commit -m "feat(scan): persist scan job lifecycle"
```

- [ ] **Step 7: Build, open, and pause for manual test**

Rebuild and open the debug executable. Ask the user to confirm:

- existing environment management still works;
- reopening the app does not start disk activity automatically;
- no visible scan controls are expected yet.

Pause for feedback.

---

### Task 3: Refactor Discovery into One-Directory Work Units

**Files:**
- Modify: `apps/desktop/src-tauri/src/services/asset_discovery.rs`
- Test: `apps/desktop/src-tauri/src/services/asset_discovery.rs`

**Interfaces:**
- Produces:

```rust
pub struct PreparedScanRoot {
    pub configured_path: PathBuf,
    pub canonical_path: PathBuf,
}

pub struct DirectoryDiscovery {
    pub observations: Vec<AssetObservation>,
    pub child_directories: Vec<PathBuf>,
    pub issues: Vec<DiscoveryIssue>,
}

pub fn prepare_scan_root(path: &Path) -> Result<PreparedScanRoot, DiscoveryIssue>;

pub fn discover_directory(
    environment_id: Uuid,
    root_kind: AssetRootKind,
    canonical_root: &Path,
    directory: &Path,
) -> DirectoryDiscovery;
```

- [ ] **Step 1: Write failing direct-directory tests**

Tests must prove:

- direct files become observations;
- child directories are returned but not recursively scanned;
- unsupported files are ignored;
- directory symlinks are not returned;
- an escaping directory is rejected with `ASSET_PATH_ESCAPES_ROOT`;
- the existing recursive `discover_assets` behavior remains unchanged by composing the new functions.

Example:

```rust
let discovery = discover_directory(
    Uuid::nil(),
    AssetRootKind::Output,
    &canonical_root,
    &canonical_root,
);
assert_eq!(discovery.observations.len(), 1);
assert_eq!(discovery.child_directories, vec![canonical_root.join("nested")]);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core asset_discovery::tests
```

Expected: compilation fails because `prepare_scan_root` and `discover_directory` do not exist.

- [ ] **Step 3: Implement one-directory discovery**

Move root validation and direct-child enumeration into the new functions. `discover_assets` becomes an in-memory queue adapter around them so all existing behavior and tests remain valid.

Sort observations, child directories, and issues by normalized path. Do not follow symlinks or write any source path.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cargo fmt --check
cargo test -p comfyneko-core asset_discovery::tests -- --nocapture
```

- [ ] **Step 5: Commit the discovery checkpoint**

```powershell
git add apps/desktop/src-tauri/src/services/asset_discovery.rs docs/superpowers
git commit -m "refactor(scan): expose resumable directory discovery"
```

- [ ] **Step 6: Build, open, and pause for manual test**

Rebuild and open the app. Manual check remains regression-focused:

- app starts;
- environment page works;
- no automatic scan occurs;
- no visible scan page is expected yet.

Pause for feedback.

---

### Task 4: Process Queue Entries, Cancel, Resume, and Finalize Assets

**Files:**
- Modify: `apps/desktop/src-tauri/src/repositories/asset_repository.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/scan_task_repository.rs`
- Create: `apps/desktop/src-tauri/src/services/scan_task_service.rs`
- Modify: `apps/desktop/src-tauri/src/services/mod.rs`
- Create: `apps/desktop/src-tauri/tests/scan_task_service.rs`

**Interfaces:**
- Produces:

```rust
#[derive(Clone)]
pub struct ScanTaskService {
    environments: EnvironmentRepository,
    tasks: ScanTaskRepository,
}

pub enum ProcessScanStep {
    Progress(ScanJob),
    Paused(ScanJob),
    Completed(ScanJob),
}

impl ScanTaskService {
    pub async fn connect_file(path: impl AsRef<Path>) -> Result<Self, ScanTaskError>;
    pub async fn start_scan(&self, environment_id: Uuid) -> Result<ScanJob, ScanTaskError>;
    pub async fn cancel_scan(&self, job_id: Uuid) -> Result<ScanJob, ScanTaskError>;
    pub async fn resume_scan(&self, job_id: Uuid) -> Result<ScanJob, ScanTaskError>;
    pub async fn list_jobs(
        &self,
        environment_id: Option<Uuid>,
    ) -> Result<Vec<ScanJob>, ScanTaskError>;
    pub async fn recover_interrupted_jobs(&self) -> Result<Vec<ScanJob>, ScanTaskError>;
    pub async fn process_next(
        &self,
        job_id: Uuid,
    ) -> Result<ProcessScanStep, ScanTaskError>;
}
```

- [ ] **Step 1: Write failing service tests**

Use temporary directories and real SQLite. Tests must prove:

```rust
#[tokio::test]
async fn cancellation_pauses_without_losing_pending_directories() {
    let fixture = nested_scan_fixture().await;
    let job = fixture.service.start_scan(fixture.environment.id).await.unwrap();

    fixture.service.process_next(job.id).await.unwrap();
    fixture.service.cancel_scan(job.id).await.unwrap();
    let paused = fixture.service.process_next(job.id).await.unwrap();

    assert!(matches!(paused, ProcessScanStep::Paused(_)));
    assert!(fixture.pending_directory_count(job.id).await > 0);
}

#[tokio::test]
async fn resumed_job_skips_completed_directories_and_finishes() {
    let fixture = paused_scan_fixture().await;
    fixture.service.resume_scan(fixture.job.id).await.unwrap();
    let completed = fixture.run_until_stopped().await;

    assert_eq!(completed.status, ScanJobStatus::Completed);
    assert_eq!(fixture.completed_directory_count().await, fixture.total_directory_count().await);
}

#[tokio::test]
async fn only_completed_scans_mark_unseen_assets_missing() {
    let fixture = existing_asset_fixture().await;
    let paused = fixture.run_then_pause().await;
    assert_eq!(fixture.asset_availability().await, "available");

    fixture.service.resume_scan(paused.id).await.unwrap();
    fixture.run_until_stopped().await;
    assert_eq!(fixture.asset_availability().await, "missing");
}
```

Also test that a later successful scan restores a missing asset to available and that per-directory issues do not prevent completion.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core --test scan_task_service
```

Expected: compilation fails because `ScanTaskService` and transactional queue processing do not exist.

- [ ] **Step 3: Add transaction-aware asset upsert**

Refactor asset persistence around:

```rust
pub(crate) async fn upsert_with_connection(
    connection: &mut SqliteConnection,
    observation: &AssetObservation,
    scan_job_id: Option<Uuid>,
) -> Result<AssetUpsertOutcome, AssetRepositoryError>;
```

When `scan_job_id` is present:

- set `last_seen_scan_id`;
- set availability to `available`;
- clear `missing_since`;
- preserve the asset ID.

Existing standalone `AssetRepository::upsert` opens a transaction, calls the shared function with `None`, and commits.

- [ ] **Step 4: Implement transactional directory completion**

`commit_directory_result` runs in one transaction:

1. update the scan root's canonical path when first prepared;
2. upsert every observation with the job ID;
3. insert child directory queue rows;
4. insert issues;
5. mark the claimed directory completed;
6. refresh job counters;
7. commit.

If the transaction fails, the claimed row returns to pending before the error is returned.

- [ ] **Step 5: Implement service processing**

`process_next`:

1. loads the job;
2. if cancellation is requested, pauses it and returns `Paused`;
3. claims one directory;
4. prepares the root when needed;
5. runs `discover_directory` through `spawn_blocking`;
6. commits the result;
7. if no queue work remains, finalizes the job and missing assets;
8. otherwise returns `Progress`.

Finalization and missing-asset updates occur in the same transaction.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
cargo fmt --check
cargo clippy -p comfyneko-core --all-targets -- -D warnings
cargo test -p comfyneko-core --test scan_task_service
cargo test -p comfyneko-core
```

- [ ] **Step 7: Commit the task runtime checkpoint**

```powershell
git add apps/desktop/src-tauri/src/repositories apps/desktop/src-tauri/src/services apps/desktop/src-tauri/tests/scan_task_service.rs docs/superpowers
git commit -m "feat(scan): add cancellable resumable scan processing"
```

- [ ] **Step 8: Build, open, and pause for manual test**

Rebuild and open the app. Manual test remains a startup/regression check because commands and UI are added next. Confirm no scan starts without user action.

Pause for feedback.

---

### Task 5: Expose Restricted Tauri Commands and Progress Events

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/scan_commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/tests/scan_commands.rs`

**Interfaces:**
- Tauri commands:

```rust
start_scan(environment_id: Uuid, state: State<'_, ScanTaskService>, app: AppHandle) -> Result<ScanJob, String>
cancel_scan(job_id: Uuid, state: State<'_, ScanTaskService>) -> Result<ScanJob, String>
resume_scan(job_id: Uuid, state: State<'_, ScanTaskService>, app: AppHandle) -> Result<ScanJob, String>
list_scan_jobs(environment_id: Option<Uuid>, state: State<'_, ScanTaskService>) -> Result<Vec<ScanJob>, String>
```

- Event: `scan://progress`, payload `ScanJob`.

- [ ] **Step 1: Write failing command-service boundary tests**

Tests must prove:

- `start_scan` rejects an unknown environment ID;
- the service reads roots from the saved environment rather than caller-supplied paths;
- `resume_scan` rejects a completed job;
- startup recovery pauses running jobs without starting a worker.

Test the pure command service functions rather than mocking Tauri internals.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core --test scan_commands
```

Expected: compilation fails because scan command adapters do not exist.

- [ ] **Step 3: Implement Tauri adapters**

- Manage one cloneable `ScanTaskService` in Tauri state.
- During setup, call `recover_interrupted_jobs` and do not spawn workers.
- `start_scan` and `resume_scan` spawn a Tokio loop calling `process_next`.
- Emit `scan://progress` only after committed state changes.
- `cancel_scan` only requests cancellation.
- Register all four commands in `generate_handler!`.
- Do not add filesystem or shell capabilities.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cargo fmt --check
cargo clippy -p comfyneko-core --all-targets -- -D warnings
cargo test -p comfyneko-core --test scan_commands
cargo test -p comfyneko-core
pnpm.cmd --dir apps/desktop exec tauri build --debug --no-bundle
```

- [ ] **Step 5: Commit the Tauri checkpoint**

```powershell
git add apps/desktop/src-tauri/src/commands apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/scan_commands.rs docs/superpowers
git commit -m "feat(scan): expose restricted scan task commands"
```

- [ ] **Step 6: Open and pause for manual test**

Open the application. Confirm it starts, restores existing environment profiles, and does not automatically launch a scan. The visible controls arrive in Task 6.

Pause for feedback.

---

### Task 6: Add the Minimal Scan Task Panel

**Files:**
- Create: `apps/desktop/src/features/scans/scanTaskApi.ts`
- Create: `apps/desktop/src/features/scans/ScanTaskPage.tsx`
- Create: `apps/desktop/src/features/scans/ScanTaskPage.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/shell/AppShell.tsx`
- Modify: `apps/desktop/src/shell/AppShell.test.tsx`
- Modify: `apps/desktop/src/i18n/translate.ts`
- Modify: `apps/desktop/src/styles/index.css`

**Interfaces:**

```ts
export type ScanJobStatus = "queued" | "running" | "paused" | "completed" | "failed";

export type ScanJob = {
  id: string;
  environment_id: string;
  status: ScanJobStatus;
  pause_reason: "user_requested" | "application_interrupted" | null;
  cancel_requested: boolean;
  queued_directories: number;
  completed_directories: number;
  discovered_assets: number;
  issue_count: number;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
  last_error: string | null;
};

export type ScanTaskApi = {
  listJobs(environmentId?: string): Promise<ScanJob[]>;
  startScan(environmentId: string): Promise<ScanJob>;
  cancelScan(jobId: string): Promise<ScanJob>;
  resumeScan(jobId: string): Promise<ScanJob>;
  subscribeProgress(listener: (job: ScanJob) => void): Promise<() => void>;
};
```

- [ ] **Step 1: Write failing UI tests**

Tests must prove:

```tsx
it("starts a scan for the selected saved environment", async () => {
  render(<ScanTaskPage environmentApi={environmentApi} scanApi={scanApi} />);
  await user.selectOptions(screen.getByLabelText("扫描环境"), environment.id);
  await user.click(screen.getByRole("button", { name: "开始扫描" }));
  expect(scanApi.startScan).toHaveBeenCalledWith(environment.id);
});

it("shows resume only for paused jobs and cancel only for active jobs", async () => {
  render(<ScanTaskPage environmentApi={environmentApi} scanApi={scanApiWithJobs} />);
  expect(await screen.findByRole("button", { name: "恢复扫描" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "取消扫描" })).toBeInTheDocument();
});

it("updates a job when a progress event arrives", async () => {
  render(<ScanTaskPage environmentApi={environmentApi} scanApi={eventScanApi} />);
  emitProgress({ ...runningJob, discovered_assets: 42 });
  expect(await screen.findByText("42")).toBeInTheDocument();
});
```

Also test loading, empty, error, failed, and read-only notice states in both locale structures.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
pnpm.cmd --dir apps/desktop test ScanTaskPage.test.tsx
```

Expected: tests fail because the page and API do not exist.

- [ ] **Step 3: Implement API and event subscription**

Use:

```ts
invoke<ScanJob>("start_scan", { environmentId });
invoke<ScanJob>("cancel_scan", { jobId });
invoke<ScanJob>("resume_scan", { jobId });
invoke<ScanJob[]>("list_scan_jobs", { environmentId });
listen<ScanJob>("scan://progress", (event) => listener(event.payload));
```

Return the event unlisten function from `subscribeProgress`.

- [ ] **Step 4: Implement navigation and panel**

- Add “扫描任务 / Scan tasks” to the sidebar using a Lucide icon and Tooltip.
- Keep page selection local to the app shell; do not introduce a router dependency.
- Preserve the environment page unchanged.
- Load saved environments and persisted jobs when the scan page opens.
- Render solid panels and outlined actions without decorative gradients.
- Disable start when no saved environment exists or that environment has an open job.
- Show status using icon, text, and color together.
- Make the page responsive at 240, 320, 420, and 1366 pixels.

- [ ] **Step 5: Add complete locale keys**

Include Chinese and English keys for navigation, title, description, environment selector, start, cancel, resume, statuses, counts, loading, empty, error, read-only notice, and pause reasons.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
git diff --check
```

- [ ] **Step 7: Commit the UI checkpoint**

```powershell
git add apps/desktop/src docs/superpowers
git commit -m "feat(scan): add scan task control panel"
```

- [ ] **Step 8: Build, open, and pause for functional manual test**

Run:

```powershell
pnpm.cmd --dir apps/desktop exec tauri build --debug --no-bundle
Start-Process -FilePath (Resolve-Path 'target/debug/comfyneko.exe')
```

Ask the user to test:

- open “扫描任务” from the sidebar;
- select a saved environment;
- start a scan;
- observe directory and asset counts;
- cancel while work remains;
- close and reopen the app;
- confirm the task is paused and does not auto-resume;
- click resume and observe progress;
- verify the environment page still works;
- check light/dark themes, Chinese/English, and narrow-window layout.

Pause until the user reports the result.

---

### Task 7: Complete Verification, Documentation, and Push

**Files:**
- Modify: `README.md`
- Modify: `docs/05-路线图与验收标准.md`
- Modify: `docs/06-开发路线与GitHub推送规范.md`
- Modify: `docs/DEVELOPMENT_LOG.md`
- Modify: `docs/superpowers/plans/2026-09-03-scan-task-runtime.md`
- Create ignored evidence: `outputs/scan-task-runtime/verification.md`

- [ ] **Step 1: Run the complete automated gate**

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --check
cargo clippy -p comfyneko-core --all-targets -- -D warnings
cargo test -p comfyneko-core
$env:COMFYNEKO_SMOKE_ROOT='D:\AIGC\ComfyUI Installs\ComfyUI_Company\ComfyUI'
$env:COMFYNEKO_SMOKE_PYTHON='D:\AIGC\ComfyUI Installs\ComfyUI_Company\standalone-env\python.exe'
cargo test -p comfyneko-core --test live_environment -- --ignored --nocapture
pnpm.cmd --dir apps/desktop exec tauri build --debug --no-bundle
git diff --check
```

- [ ] **Step 2: Record the manual results**

Document every opened checkpoint and the user's reported result. Keep automated checks, app startup, user manual interaction, and unverified behavior distinct.

- [ ] **Step 3: Update milestone records**

Record:

- persistent state machine and queue;
- cancellation and explicit resume;
- startup recovery without automatic scanning;
- missing-asset rules;
- Tauri commands/events;
- minimal scan-task panel;
- the deferred model subtype list;
- test counts, build artifact, SHA256, and manual test status;
- next milestone.

- [ ] **Step 4: Create ignored verification evidence**

Write `outputs/scan-task-runtime/verification.md` with command results, app binary details, manual checkpoint results, and the statement that no Computer Use was used.

- [ ] **Step 5: Commit and push**

```powershell
git add README.md apps/desktop/src apps/desktop/src-tauri docs
git commit -m "feat(scan): deliver persistent scan task runtime"
git push origin feat/scan-task-runtime
```

- [ ] **Step 6: Verify synchronization**

Confirm local and remote `feat/scan-task-runtime` HEAD hashes match and the tracked worktree is clean.

## Plan Self-Review

- Spec coverage: versioned migrations, job/root/queue/issue persistence, one-directory discovery, transactional observations, cancellation, explicit resume, startup recovery, completion-only missing marking, commands, events, minimal UI, manual checkpoints, and deferred model subtyping are covered by Tasks 1-7.
- Placeholder scan: all tasks provide exact files, interfaces, state transitions, SQL responsibilities, test behavior, commands, and manual acceptance steps.
- Type consistency: `ScanJob`, `ScanJobStatus`, `ScanPauseReason`, `ScanRootSnapshot`, `ScanDirectoryWork`, `ScanTaskRepository`, `ScanTaskService`, `ProcessScanStep`, `ScanTaskApi`, and Tauri command names remain consistent throughout.
