# M2.2 Background Asset Scan Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, cancellable, explicitly resumable read-only asset scan engine and a minimal desktop scan control page.

**Architecture:** A shared SQLite pool stores task state, a persistent directory queue, issues, checkpoints, and asset presence. A background Rust worker processes one directory at a time; each complete directory is committed atomically. React uses Tauri query commands and sequential polling, while all source roots remain read-only.

**Tech Stack:** Rust 2021, Tokio, SQLx SQLite, Tauri 2, React 18, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-asset-scan-task-design.md`

## Global Constraints

- Work only in `D:\AIGC\codex\Projects\软件开发\ComfyNeko\.worktrees\environment-profile`.
- Preserve every existing uncommitted environment UI change.
- Do not run reset, checkout, stash, recursive cleanup, Git commit, Git push, packaging, or Release creation.
- Never modify, delete, move, rename, create, or chmod files inside a bound ComfyUI root.
- Tauri start commands accept only saved environment IDs; the frontend never supplies arbitrary scan roots.
- Application restart converts unfinished work to `interrupted`; it never automatically resumes scanning.
- Only a clean, complete scan with an unchanged root snapshot may mark unseen assets missing.
- Asset records are never deleted by M2.2.
- Use failing tests before every production behavior change.

---

### Task 1: Versioned migrations and shared application database

**Files:**
- Create: `apps/desktop/src-tauri/src/repositories/database.rs`
- Create: `apps/desktop/src-tauri/migrations/0003_asset_scan_tasks.sql`
- Modify: `apps/desktop/src-tauri/src/repositories/migrations.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/mod.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/environment_repository.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/asset_repository.rs`
- Modify: `apps/desktop/src-tauri/build.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Test: `apps/desktop/src-tauri/tests/database_migrations.rs`

**Interfaces:**
- Produces:

```rust
#[derive(Clone)]
pub struct AppDatabase {
    pool: sqlx::SqlitePool,
}

impl AppDatabase {
    pub async fn connect_file(path: impl AsRef<Path>) -> Result<Self, AppDatabaseError>;
    pub async fn connect_in_memory() -> Result<Self, AppDatabaseError>;
    pub fn pool(&self) -> &SqlitePool;
}
```

- `EnvironmentRepository::from_pool` and `AssetRepository::from_pool` continue to accept a cloned pool.

- [ ] **Step 1: Write the legacy-upgrade failing test**

Create a temporary SQLite file, manually apply the current `0001` and `0002`
SQL, insert one environment and one asset, then call `AppDatabase::connect_file`.
Assert that:

```rust
assert_eq!(environment_count, 1);
assert_eq!(asset_count, 1);
assert!(column_names.contains(&"last_seen_scan_id".to_owned()));
assert!(table_names.contains(&"asset_scan_tasks".to_owned()));
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```powershell
$env:Path=(Join-Path $env:USERPROFILE '.cargo\bin') + ';' + $env:Path
cargo test -p comfyneko-core --test database_migrations
```

Expected: compilation fails because `AppDatabase` and migration `0003` do not exist.

- [ ] **Step 3: Add migration `0003_asset_scan_tasks.sql`**

Add the four asset-presence columns and create:

```sql
asset_scan_tasks
asset_scan_directories
asset_scan_issues
```

Add a partial unique index that allows only one task per environment whose
status is one of:

```text
queued, running, cancelling, paused, interrupted
```

- [ ] **Step 4: Replace raw migration replay with SQLx Migrator**

Use:

```rust
static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
```

Add the SQLx `macros` feature and make `build.rs` emit:

```rust
println!("cargo:rerun-if-changed=migrations");
```

- [ ] **Step 5: Implement `AppDatabase`**

For file databases configure:

```rust
SqliteJournalMode::Wal
SqliteSynchronous::Normal
foreign_keys(true)
busy_timeout(Duration::from_secs(5))
create_if_missing(true)
```

Use one connection for `:memory:` tests and a small pool for files.

- [ ] **Step 6: Route existing repositories through the shared pool**

Keep current convenience `connect_file/connect_in_memory` methods, but make
them delegate to `AppDatabase` so old tests continue to pass.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```powershell
cargo test -p comfyneko-core --test database_migrations
cargo test -p comfyneko-core --test environment_repository
cargo test -p comfyneko-core --test asset_repository
```

- [ ] **Step 8: Stop at a local review checkpoint**

Run `cargo fmt --check` and `git diff --check`. Do not commit.

---

### Task 2: Scan task domain and persistent repository

**Files:**
- Create: `apps/desktop/src-tauri/src/domain/asset_scan.rs`
- Create: `apps/desktop/src-tauri/src/repositories/asset_scan_repository.rs`
- Create: `apps/desktop/src-tauri/tests/asset_scan_repository.rs`
- Modify: `apps/desktop/src-tauri/src/domain/mod.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/mod.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/environment_repository.rs`

**Interfaces:**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetScanStatus {
    Queued,
    Running,
    Cancelling,
    Paused,
    Interrupted,
    Completed,
    CompletedWithIssues,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetScanTaskSnapshot {
    pub id: Uuid,
    pub environment_id: Uuid,
    pub status: AssetScanStatus,
    pub processed_directories: u64,
    pub pending_directories: u64,
    pub discovered_assets: u64,
    pub inserted_count: u64,
    pub updated_count: u64,
    pub unchanged_count: u64,
    pub invalidated_count: u64,
    pub issue_count: u64,
    pub current_path: Option<PathBuf>,
    pub can_cancel: bool,
    pub can_resume: bool,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub error: Option<AssetScanErrorSnapshot>,
}
```

Repository methods:

```rust
create_task(environment_id, roots)
get_task(task_id)
find_active_for_environment(environment_id)
list_tasks(environment_id)
request_cancel(task_id)
resume_task(task_id)
recover_interrupted_tasks()
claim_next_directory(task_id)
list_issues(task_id)
```

- [ ] **Step 1: Write state-machine and persistence failing tests**

Tests must prove:

```rust
queued -> running -> cancelling -> paused -> queued
running after reconnect -> interrupted
processing directory after reconnect -> pending
```

Also assert a second active task for the same environment is rejected.

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core --test asset_scan_repository
```

Expected: compilation fails because scan domain and repository are missing.

- [ ] **Step 3: Implement domain parsing and capabilities**

`can_cancel` is true only for `queued/running/cancelling`.
`can_resume` is true only for `paused/interrupted`.
Parsing an unknown persisted status returns a typed data error.

- [ ] **Step 4: Implement environment lookup by ID**

Add:

```rust
pub async fn get(&self, id: Uuid) -> Result<Option<EnvironmentProfile>, RepositoryError>;
```

- [ ] **Step 5: Implement task and directory persistence**

Root snapshots are sorted and deduplicated before JSON serialization.
Task creation inserts one `pending` directory per prepared root in one
transaction.

- [ ] **Step 6: Implement interruption recovery**

In one transaction:

```text
running/cancelling -> interrupted
processing directory -> pending
current_path -> NULL
```

Do not spawn a worker.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```powershell
cargo test -p comfyneko-core --test asset_scan_repository
cargo test -p comfyneko-core --test environment_repository
```

- [ ] **Step 8: Stop at a local review checkpoint**

Run `cargo fmt --check` and `git diff --check`. Do not commit.

---

### Task 3: Cancellable single-directory discovery

**Files:**
- Modify: `apps/desktop/src-tauri/src/services/asset_discovery.rs`

**Interfaces:**

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedScanRoot {
    pub kind: AssetRootKind,
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirectoryDiscovery {
    pub observations: Vec<AssetObservation>,
    pub child_directories: Vec<PathBuf>,
    pub issues: Vec<DiscoveryIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DirectoryDiscoveryOutcome {
    Completed(DirectoryDiscovery),
    Cancelled,
}

pub fn discover_directory(
    environment_id: Uuid,
    root: &PreparedScanRoot,
    directory: &Path,
    should_cancel: impl Fn() -> bool,
) -> DirectoryDiscoveryOutcome;
```

- [ ] **Step 1: Write failing unit tests**

Add tests that assert:

```rust
// Only direct files are observations.
assert_eq!(report.observations.len(), 1);
assert_eq!(report.child_directories, vec![nested]);

// Cancellation discards all partial directory results.
assert_eq!(outcome, DirectoryDiscoveryOutcome::Cancelled);
```

Add platform-specific coverage proving directory symlinks and Windows reparse
points are never returned as child directories.

- [ ] **Step 2: Run discovery tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core services::asset_discovery::tests -- --nocapture
```

- [ ] **Step 3: Implement stable one-directory discovery**

Read one directory, sort entries by normalized path, check cancellation before
each entry, reject escapes, classify direct files, and return direct child
directories.

- [ ] **Step 4: Rebuild `discover_assets` as a compatibility wrapper**

Use an in-memory pending-directory stack around `discover_directory`.
Preserve deterministic final sorting and all existing M2.1 behavior.

- [ ] **Step 5: Run focused and existing discovery tests**

Run:

```powershell
cargo test -p comfyneko-core services::asset_discovery::tests -- --nocapture
```

- [ ] **Step 6: Stop at a local review checkpoint**

Run `cargo fmt --check` and `git diff --check`. Do not commit.

---

### Task 4: Atomic directory batches and safe stale reconciliation

**Files:**
- Modify: `apps/desktop/src-tauri/src/repositories/asset_repository.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/asset_scan_repository.rs`
- Modify: `apps/desktop/src-tauri/tests/asset_scan_repository.rs`
- Modify: `apps/desktop/src-tauri/tests/asset_repository.rs`

**Interfaces:**

```rust
pub async fn commit_directory(
    &self,
    task_id: Uuid,
    claimed: &ClaimedScanDirectory,
    discovery: &DirectoryDiscovery,
) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError>;

pub async fn finalize_if_complete(
    &self,
    task_id: Uuid,
    current_roots: &[AssetScanRoot],
) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError>;
```

- [ ] **Step 1: Write atomicity and presence failing tests**

Use a valid first observation and a second `u64::MAX` observation. Assert that a
failed batch leaves:

```rust
assert!(assets.is_empty());
assert_eq!(directory.state, Pending);
assert_eq!(task.processed_directories, 0);
```

Add A/B asset fixtures that prove clean completion marks only unseen B missing,
and rediscovery restores B with the same ID.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core --test asset_scan_repository
cargo test -p comfyneko-core --test asset_repository
```

- [ ] **Step 3: Extract transaction-aware asset upsert**

Implement one internal helper used by both ordinary upsert and scan batches.
For scan batches, unchanged assets still update:

```text
last_seen_scan_id
last_seen_at
is_present = 1
missing_since = NULL
```

- [ ] **Step 4: Implement atomic directory commit**

Within one SQL transaction, upsert observations, enqueue children, insert
issues, mark the directory done, and update counters.

- [ ] **Step 5: Implement conservative finalization**

If any issue exists, roots differ, cancel is requested, or directories remain,
do not update asset presence. Clean completion marks unseen assets missing and
sets task `completed` in the same transaction.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
cargo test -p comfyneko-core --test asset_scan_repository
cargo test -p comfyneko-core --test asset_repository
```

- [ ] **Step 7: Stop at a local review checkpoint**

Run `cargo fmt --check` and `git diff --check`. Do not commit.

---

### Task 5: Background worker, cancel, resume, and restart recovery

**Files:**
- Create: `apps/desktop/src-tauri/src/services/asset_scan_service.rs`
- Create: `apps/desktop/src-tauri/tests/asset_scan_service.rs`
- Modify: `apps/desktop/src-tauri/src/services/mod.rs`

**Interfaces:**

```rust
#[derive(Clone)]
pub struct AssetScanService { /* shared repositories and cancellation map */ }

impl AssetScanService {
    pub async fn start(&self, environment_id: Uuid) -> Result<AssetScanTaskSnapshot, AssetScanServiceError>;
    pub async fn cancel(&self, task_id: Uuid) -> Result<AssetScanTaskSnapshot, AssetScanServiceError>;
    pub async fn resume(&self, task_id: Uuid) -> Result<AssetScanTaskSnapshot, AssetScanServiceError>;
    pub async fn get(&self, task_id: Uuid) -> Result<AssetScanTaskSnapshot, AssetScanServiceError>;
    pub async fn list(&self, environment_id: Option<Uuid>) -> Result<Vec<AssetScanTaskSnapshot>, AssetScanServiceError>;
    pub async fn issues(&self, task_id: Uuid) -> Result<Vec<AssetScanIssue>, AssetScanServiceError>;
    pub async fn recover_interrupted(&self) -> Result<u64, AssetScanServiceError>;
}
```

- [ ] **Step 1: Write failing service tests**

Use a temporary file database and temporary directory tree. Tests must prove:

- `start` returns before the whole scan is complete.
- worker eventually completes a multi-directory scan.
- cancellation leaves the current directory pending and stops counters.
- resume uses the same task ID and finishes remaining directories.
- reconnect plus `recover_interrupted` produces `interrupted` without scanning.
- two workers are not spawned for the same task.

- [ ] **Step 2: Run service tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core --test asset_scan_service -- --nocapture
```

- [ ] **Step 3: Implement the worker loop**

Use a task-specific `Arc<AtomicBool>`. Each iteration:

```text
check cancel
claim pending directory
spawn_blocking discover_directory
check cancel
commit complete directory
repeat or finalize
```

Panics or join failures write `SCAN_WORKER_ERROR` and `failed`.

- [ ] **Step 4: Implement idempotent start and cancel**

`start` returns the existing active/resumable task for the environment rather
than creating a duplicate. Repeated cancel returns the latest snapshot.

- [ ] **Step 5: Implement explicit resume**

Only `paused/interrupted` can resume. Clear the cancellation token, set queued,
and spawn one worker with the same task ID.

- [ ] **Step 6: Run service tests and verify GREEN**

Run:

```powershell
cargo test -p comfyneko-core --test asset_scan_service -- --nocapture
```

- [ ] **Step 7: Stop at a local review checkpoint**

Run `cargo fmt --check`, Clippy for the crate, and `git diff --check`.

---

### Task 6: Command service and Tauri IPC

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/asset_scan_commands.rs`
- Create: `apps/desktop/src-tauri/tests/asset_scan_commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/tauri_commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**

```text
start_asset_scan(environment_id)
get_asset_scan_task(task_id)
list_asset_scan_tasks(environment_id?)
list_asset_scan_issues(task_id)
cancel_asset_scan(task_id)
resume_asset_scan(task_id)
```

- [ ] **Step 1: Write command-service failing tests**

Tests cover unknown environment, no roots, start/query/cancel/resume, stable
snake_case JSON, and a file-database reconnect.

- [ ] **Step 2: Run command tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core --test asset_scan_commands
```

- [ ] **Step 3: Add a Tauri-free command service**

Create a command service that converts typed service errors into stable:

```rust
pub struct CommandErrorPayload {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}
```

- [ ] **Step 4: Add thin Tauri wrappers**

Wrappers parse UUID strings, call the managed service, and return typed
snapshots. They do not accept paths.

- [ ] **Step 5: Build all services from one `AppDatabase`**

In `lib.rs`, connect once, build environment and scan services from the shared
pool, run interruption recovery, manage both services, and register the six
commands.

- [ ] **Step 6: Run command and regression tests**

Run:

```powershell
cargo test -p comfyneko-core --test asset_scan_commands
cargo test -p comfyneko-core --test environment_commands
cargo test -p comfyneko-core
```

- [ ] **Step 7: Stop at a local review checkpoint**

Run formatting, Clippy, and `git diff --check`. Do not commit.

---

### Task 7: Frontend scan API

**Files:**
- Create: `apps/desktop/src/features/assets/assetScanApi.ts`
- Create: `apps/desktop/src/features/assets/assetScanApi.test.ts`

**Interfaces:**

```ts
export type AssetScanApi = {
  start(environmentId: string): Promise<AssetScanTask>;
  get(taskId: string): Promise<AssetScanTask>;
  list(environmentId?: string): Promise<AssetScanTask[]>;
  listIssues(taskId: string): Promise<AssetScanIssue[]>;
  cancel(taskId: string): Promise<AssetScanTask>;
  resume(taskId: string): Promise<AssetScanTask>;
};
```

- [ ] **Step 1: Write API mapping failing tests**

Mock `invoke` and assert exact command names and camelCase arguments.
Browser-preview list returns `[]`; browser-preview start/cancel/resume reject
with `Desktop runtime required`.

- [ ] **Step 2: Run API tests and verify RED**

Run:

```powershell
pnpm.cmd --dir apps/desktop exec vitest run src/features/assets/assetScanApi.test.ts
```

- [ ] **Step 3: Implement types and Tauri adapter**

Mirror the complete Rust snapshot, including capability booleans and structured
errors. Do not derive capabilities in TypeScript.

- [ ] **Step 4: Run API tests and verify GREEN**

Run the focused Vitest command again.

- [ ] **Step 5: Stop at a local review checkpoint**

Run `pnpm.cmd --dir apps/desktop build` and `git diff --check`.

---

### Task 8: Minimal asset scan control page

**Files:**
- Create: `apps/desktop/src/features/assets/AssetScanPage.tsx`
- Create: `apps/desktop/src/features/assets/AssetScanPage.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/shell/AppShell.tsx`
- Modify: `apps/desktop/src/shell/AppShell.test.tsx`
- Modify: `apps/desktop/src/i18n/translate.ts`
- Modify: `apps/desktop/src/styles/index.css`

**Interfaces:**

Expose navigation through the existing render context:

```ts
export type AppShellRenderContext = {
  locale: Locale;
  page: AppPage;
  preferences: AppPreferences;
  navigateTo(page: AppPage): void;
  updatePreferences(patch: Partial<AppPreferences>): void;
};
```

`AssetScanPage` receives injectable `environmentApi` and `scanApi`.

- [ ] **Step 1: Write page failing tests**

Tests must prove:

- no environment shows a short empty state and navigates to environment setup;
- environments load into a required selector without auto-starting;
- start sends the selected environment ID exactly once;
- running shows current path and cancel;
- paused/interrupted shows resume;
- completed stops polling and shows final counts;
- completed-with-issues states that missing assets were not reconciled;
- request failure shows retry;
- 800ms polling is sequential and stale responses are ignored.

- [ ] **Step 2: Run page tests and verify RED**

Run:

```powershell
pnpm.cmd --dir apps/desktop exec vitest run src/features/assets/AssetScanPage.test.tsx src/App.test.tsx
```

- [ ] **Step 3: Implement the page structure**

Use a single compact header, one environment selector, one primary action row,
one status strip, one progress/details region, and an optional issue list.
Do not create KPI cards, charts, a hero, an asset grid, or nested dashboard
panels.

- [ ] **Step 4: Implement sequential polling**

Schedule the next 800ms poll only after the current request settles. Increment
a generation ref when environment/task changes or the component unmounts;
ignore responses from older generations.

- [ ] **Step 5: Route the asset navigation**

Replace only the `assets` planned page with `AssetScanPage`. Keep models,
workflows, prompts, nodes, and home as honest planned pages.

- [ ] **Step 6: Add bilingual copy and responsive CSS**

Use existing color, spacing, focus, and motion tokens. At 420/320/240px,
stack selector and actions, constrain paths, and avoid horizontal overflow.
Honor reduced motion.

- [ ] **Step 7: Run page and app tests**

Run:

```powershell
pnpm.cmd --dir apps/desktop exec vitest run src/features/assets/AssetScanPage.test.tsx src/App.test.tsx src/shell/AppShell.test.tsx
```

- [ ] **Step 8: Run browser visual checks**

Use Playwright at 1180, 420, 320, and 240px in Chinese/light and
English/dark. Assert:

```text
document.documentElement.scrollWidth === document.documentElement.clientWidth
console errors === 0
```

- [ ] **Step 9: Stop at a local review checkpoint**

Keep the running Tauri window open for the user's later combined manual test.
Do not commit.

---

### Task 9: Documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/02-技术架构与数据模型.md`
- Modify: `docs/05-路线图与验收标准.md`
- Modify: `docs/06-开发路线与GitHub推送规范.md`
- Modify: `docs/DEVELOPMENT_LOG.md`

- [ ] **Step 1: Update milestone status**

Document M2.2 task semantics, explicit resume, conservative stale marking,
current database path `app_local_data_dir()/comfyneko.db`, tests, screenshots,
known limitations, and the next M2.3 milestone.

- [ ] **Step 2: Run the complete backend gate**

```powershell
$env:Path=(Join-Path $env:USERPROFILE '.cargo\bin') + ';' + $env:Path
cargo fmt --check
cargo test -p comfyneko-core
cargo clippy -p comfyneko-core --all-targets --all-features -- -D warnings
```

- [ ] **Step 3: Run the complete frontend gate**

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
```

- [ ] **Step 4: Build the Tauri debug application**

```powershell
pnpm.cmd --dir apps/desktop exec tauri build --debug --no-bundle
```

- [ ] **Step 5: Run final repository checks**

```powershell
git diff --check
git status --short --branch
```

- [ ] **Step 6: Open the desktop application**

Keep exactly one `comfyneko.exe` instance open and responsive. Do not install,
package, commit, or push.
