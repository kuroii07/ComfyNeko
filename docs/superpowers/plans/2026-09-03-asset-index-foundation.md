# Asset Index Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested Rust foundation that discovers supported assets inside approved environment roots and stores duplicate-free incremental file facts in ComfyNeko's SQLite database.

**Architecture:** Introduce asset domain types, a read-only discovery service, and an asset repository. Discovery produces deterministic observations and isolated issues without touching SQLite; persistence consumes observations and returns inserted, updated, or unchanged outcomes while preserving stable record IDs. Environment and asset repositories share forward-only migration execution but remain separate data-access units.

**Tech Stack:** Rust 2021, Tauri 2, SQLx SQLite, Tokio, Chrono, UUID, Tempfile.

**Spec:** `docs/superpowers/specs/2026-09-03-asset-index-foundation-design.md`

## Global Constraints

- Scan only roots supplied from an already validated environment profile.
- Never create, rename, move, delete, rewrite, chmod, or touch files under a bound root.
- Do not follow directory symlinks or reparse-point targets.
- Keep filesystem discovery separate from SQLite persistence.
- Ignore unsupported extensions rather than storing generic assets.
- Preserve an asset record ID when the same environment and normalized path is rescanned.
- Do not implement UI, thumbnails, metadata parsing, hashing, file watching, cancellation, resume, favorites, tags, or FTS5 in this milestone.
- Do not commit generated databases, caches, scanned files, `target/`, or `outputs/`.

---

### Task 1: Add Asset Domain Types and Classification

**Files:**
- Create: `apps/desktop/src-tauri/src/domain/asset.rs`
- Modify: `apps/desktop/src-tauri/src/domain/mod.rs`
- Create: `apps/desktop/src-tauri/src/services/asset_discovery.rs`
- Modify: `apps/desktop/src-tauri/src/services/mod.rs`

**Interfaces:**
- Consumes: `Uuid`, `PathBuf`, `DateTime<Utc>`.
- Produces:

```rust
pub enum AssetKind {
    Image,
    Video,
    Audio,
    Model,
    Workflow,
}

pub enum AssetRootKind {
    Input,
    Output,
    Models,
    Workflows,
}

pub struct AssetScanRoot {
    pub kind: AssetRootKind,
    pub path: PathBuf,
}

pub struct AssetObservation {
    pub environment_id: Uuid,
    pub root_kind: AssetRootKind,
    pub normalized_path: PathBuf,
    pub kind: AssetKind,
    pub size_bytes: u64,
    pub modified_at: Option<DateTime<Utc>>,
}

pub struct AssetRecord {
    pub id: Uuid,
    pub observation: AssetObservation,
    pub fingerprint: Option<String>,
    pub indexed_at: DateTime<Utc>,
}

pub enum AssetUpsertOutcome {
    Inserted(AssetRecord),
    Updated(AssetRecord),
    Unchanged(AssetRecord),
}

pub fn classify_asset(root_kind: AssetRootKind, path: &Path) -> Option<AssetKind>;
```

- [x] **Step 1: Write failing classification tests**

Add table-driven tests that use literal expected values:

```rust
#[test]
fn classifies_supported_extensions_case_insensitively() {
    let cases = [
        (AssetRootKind::Input, "preview.PNG", Some(AssetKind::Image)),
        (AssetRootKind::Output, "clip.MP4", Some(AssetKind::Video)),
        (AssetRootKind::Output, "voice.FLAC", Some(AssetKind::Audio)),
        (AssetRootKind::Models, "flux.SAFETENSORS", Some(AssetKind::Model)),
        (AssetRootKind::Workflows, "portrait.JSON", Some(AssetKind::Workflow)),
    ];

    for (root_kind, path, expected) in cases {
        assert_eq!(classify_asset(root_kind, Path::new(path)), expected);
    }
}

#[test]
fn rejects_extensions_that_do_not_match_the_root_role() {
    assert_eq!(
        classify_asset(AssetRootKind::Input, Path::new("workflow.json")),
        None
    );
    assert_eq!(
        classify_asset(AssetRootKind::Models, Path::new("preview.png")),
        None
    );
}
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core asset_discovery::tests::classifies_supported_extensions_case_insensitively
```

Expected: compilation fails because `domain::asset` and `classify_asset` do not exist.

- [x] **Step 3: Implement the minimal serializable domain types**

Derive `Debug`, `Clone`, `Copy` where valid, `PartialEq`, `Eq`, `Serialize`, and `Deserialize`. Use `snake_case` serialization for `AssetKind` and `AssetRootKind`. Implement stable storage conversion methods:

```rust
impl AssetKind {
    pub const fn as_str(self) -> &'static str;
    pub fn parse(value: &str) -> Option<Self>;
}

impl AssetRootKind {
    pub const fn as_str(self) -> &'static str;
    pub fn parse(value: &str) -> Option<Self>;
}
```

Implement `classify_asset` with exact, case-insensitive extension allowlists from the design specification. Files without extensions and unsupported extensions return `None`.

- [x] **Step 4: Verify GREEN**

Run:

```powershell
cargo fmt --check
cargo test -p comfyneko-core asset_discovery::tests
```

Expected: classification and root-role mismatch tests pass.

- [x] **Step 5: Commit the domain checkpoint**

```powershell
git add apps/desktop/src-tauri/src/domain apps/desktop/src-tauri/src/services
git commit -m "feat(index): define asset observations and classification"
```

---

### Task 2: Implement Read-Only Recursive Discovery

**Files:**
- Modify: `apps/desktop/src-tauri/src/services/asset_discovery.rs`
- Test: `apps/desktop/src-tauri/src/services/asset_discovery.rs`

**Interfaces:**
- Consumes:

```rust
pub struct AssetScanRoot {
    pub kind: AssetRootKind,
    pub path: PathBuf,
}
```

- Produces:

```rust
pub struct DiscoveryIssue {
    pub path: PathBuf,
    pub code: String,
    pub message: String,
}

pub struct DiscoveryReport {
    pub observations: Vec<AssetObservation>,
    pub issues: Vec<DiscoveryIssue>,
}

pub fn discover_assets(
    environment_id: Uuid,
    roots: &[AssetScanRoot],
) -> DiscoveryReport;
```

- [x] **Step 1: Write failing discovery tests**

Create a temporary tree containing:

```text
input/
  reference.PNG
  nested/
    animation.mp4
  ignored.txt
models/
  checkpoints/
    flux.safetensors
workflows/
  portrait.json
```

Assert exact sorted observations:

```rust
assert_eq!(report.issues, Vec::<DiscoveryIssue>::new());
assert_eq!(
    report
        .observations
        .iter()
        .map(|asset| asset.kind)
        .collect::<Vec<_>>(),
    vec![
        AssetKind::Image,
        AssetKind::Video,
        AssetKind::Model,
        AssetKind::Workflow,
    ]
);
assert!(!input_root.join("created-by-scan").exists());
```

Add focused tests for:

- missing root produces `ASSET_ROOT_NOT_FOUND`;
- a file supplied as a root produces `ASSET_ROOT_NOT_DIRECTORY`;
- unsupported files are ignored;
- identical file paths are not emitted twice when the same root is repeated;
- a directory symlink is not traversed when the platform permits creating the fixture;
- valid observations remain present when another root fails.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core asset_discovery::tests
```

Expected: compilation fails because `discover_assets`, `DiscoveryIssue`, and `DiscoveryReport` do not exist.

- [x] **Step 3: Implement guarded traversal**

For each root:

1. reject missing paths and non-directories with root-level issue codes;
2. canonicalize the root once;
3. traverse iteratively with a `Vec<PathBuf>`;
4. inspect entries through `symlink_metadata`;
5. skip directory symlinks without following them;
6. canonicalize candidate files and require `candidate.starts_with(canonical_root)`;
7. call `classify_asset` before reading file metadata fields;
8. convert `modified()` to `DateTime<Utc>` when available;
9. collect entry failures as issues and continue;
10. sort observations and issues by path;
11. deduplicate observations by `(environment_id, normalized_path)`.

Use exact issue codes:

```text
ASSET_ROOT_NOT_FOUND
ASSET_ROOT_NOT_DIRECTORY
ASSET_ROOT_UNREADABLE
ASSET_ENTRY_UNREADABLE
ASSET_PATH_ESCAPES_ROOT
```

- [x] **Step 4: Verify GREEN and read-only behavior**

Run:

```powershell
cargo fmt --check
cargo test -p comfyneko-core asset_discovery::tests -- --nocapture
```

Before and after the test, confirm the fixture contains the same source files and no additional file created by the scanner.

- [x] **Step 5: Commit the discovery checkpoint**

```powershell
git add apps/desktop/src-tauri/src/services/asset_discovery.rs
git commit -m "feat(index): discover allow-listed assets read-only"
```

---

### Task 3: Add SQLite Asset Persistence and Incremental Upserts

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0002_assets.sql`
- Create: `apps/desktop/src-tauri/src/repositories/migrations.rs`
- Create: `apps/desktop/src-tauri/src/repositories/asset_repository.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/mod.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/environment_repository.rs`
- Create: `apps/desktop/src-tauri/tests/asset_repository.rs`

**Interfaces:**
- Consumes: `AssetObservation`, `AssetRecord`, `AssetUpsertOutcome`, and an existing environment row.
- Produces:

```rust
#[derive(Clone)]
pub struct AssetRepository {
    pool: SqlitePool,
}

impl AssetRepository {
    pub async fn connect_in_memory() -> Result<Self, AssetRepositoryError>;
    pub async fn connect_file(
        database_path: impl AsRef<Path>,
    ) -> Result<Self, AssetRepositoryError>;
    pub async fn from_pool(pool: SqlitePool) -> Result<Self, AssetRepositoryError>;
    pub async fn upsert(
        &self,
        observation: &AssetObservation,
    ) -> Result<AssetUpsertOutcome, AssetRepositoryError>;
    pub async fn list_for_environment(
        &self,
        environment_id: Uuid,
    ) -> Result<Vec<AssetRecord>, AssetRepositoryError>;
}
```

- [x] **Step 1: Write failing repository integration tests**

Create tests with real SQLite storage:

```rust
#[tokio::test]
async fn repeating_an_observation_preserves_id_and_row_count() {
    let fixture = repository_fixture().await;
    let observation = image_observation(fixture.environment.id, 128, fixed_time());

    let first = fixture.assets.upsert(&observation).await.unwrap();
    let second = fixture.assets.upsert(&observation).await.unwrap();
    let rows = fixture
        .assets
        .list_for_environment(fixture.environment.id)
        .await
        .unwrap();

    assert!(matches!(first, AssetUpsertOutcome::Inserted(_)));
    assert!(matches!(second, AssetUpsertOutcome::Unchanged(_)));
    assert_eq!(first.record().id, second.record().id);
    assert_eq!(rows.len(), 1);
}

#[tokio::test]
async fn changed_file_facts_update_the_existing_asset() {
    let fixture = repository_fixture().await;
    let first = image_observation(fixture.environment.id, 128, fixed_time());
    let changed = image_observation(fixture.environment.id, 256, later_time());

    let inserted = fixture.assets.upsert(&first).await.unwrap();
    let updated = fixture.assets.upsert(&changed).await.unwrap();

    assert!(matches!(updated, AssetUpsertOutcome::Updated(_)));
    assert_eq!(inserted.record().id, updated.record().id);
    assert_eq!(updated.record().observation.size_bytes, 256);
}
```

Also assert that the same normalized path under two different environment IDs creates two records.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
cargo test -p comfyneko-core --test asset_repository
```

Expected: compilation fails because the asset repository and migration do not exist.

- [x] **Step 3: Centralize forward-only migrations**

Create `repositories::migrations::run(pool)` and execute:

```rust
const ENVIRONMENT_MIGRATION: &str =
    include_str!("../../migrations/0001_environments.sql");
const ASSET_MIGRATION: &str =
    include_str!("../../migrations/0002_assets.sql");
```

Both `EnvironmentRepository::from_pool` and `AssetRepository::from_pool` call the shared runner. Configure SQLite connections with foreign keys enabled. Existing environment migration and tests must continue to work unchanged.

- [x] **Step 4: Implement exact asset schema and upsert behavior**

Create the schema from the design specification. Before inserting:

1. convert `size_bytes` with `i64::try_from`;
2. query by `(environment_id, normalized_path)`;
3. insert with a new UUID when absent;
4. compare `root_kind`, `kind`, `size_bytes`, and `modified_at`;
5. return `Unchanged` without issuing an update when facts match;
6. otherwise update facts and `indexed_at`, preserving `id`;
7. decode all stored enums and timestamps through typed error paths.

Add:

```rust
impl AssetUpsertOutcome {
    pub fn record(&self) -> &AssetRecord;
}
```

- [x] **Step 5: Verify GREEN**

Run:

```powershell
cargo fmt --check
cargo clippy -p comfyneko-core --all-targets -- -D warnings
cargo test -p comfyneko-core --test asset_repository
cargo test -p comfyneko-core
```

Expected: insert/unchanged/update/environment-isolation tests pass and all existing tests remain green.

- [x] **Step 6: Commit the repository checkpoint**

```powershell
git add apps/desktop/src-tauri/migrations apps/desktop/src-tauri/src/repositories apps/desktop/src-tauri/tests/asset_repository.rs
git commit -m "feat(index): persist incremental asset observations"
```

---

### Task 4: Record the M2.1 Milestone and Run the Complete Gate

**Files:**
- Modify: `README.md`
- Modify: `docs/05-路线图与验收标准.md`
- Modify: `docs/06-开发路线与GitHub推送规范.md`
- Modify: `docs/DEVELOPMENT_LOG.md`
- Modify: `docs/superpowers/plans/2026-09-03-asset-index-foundation.md`
- Create ignored evidence: `outputs/asset-index-foundation/verification.md`

**Interfaces:**
- Consumes: all Task 1-3 verification evidence.
- Produces: an auditable milestone record and a pushed feature branch.

- [x] **Step 1: Run the complete project gate**

Run:

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

Expected: frontend tests pass, Vite and Tauri builds exit `0`, Rust tests pass with no Clippy warnings, live smoke reports `valid=[]`, `PYTHON_NOT_FOUND`, and `API_UNREACHABLE`, and the bound-root snapshot remains equal.

- [x] **Step 2: Update milestone records**

Record:

- implemented domain, discovery, migration, and repository files;
- test counts and exact commands;
- read-only and symlink boundaries;
- unsupported file behavior;
- the lack of UI, hashing, thumbnails, stale deletion, cancellation, and resume;
- next milestone: background scan tasks with cancellation and persisted checkpoints.

Mark M1.4 complete in `docs/06-开发路线与GitHub推送规范.md`. Add M2.1 as completed while keeping the broader M2 milestone open.

- [x] **Step 3: Create ignored verification evidence**

Write `outputs/asset-index-foundation/verification.md` with the branch, commands, outcomes, Tauri binary path, binary size, SHA256, and the statement that no Computer Use or source-file mutation was used.

- [x] **Step 4: Commit and push the milestone**

```powershell
git add README.md apps/desktop/src-tauri docs
git commit -m "feat(index): add read-only incremental asset foundation"
git push origin feat/asset-index-foundation
```

- [x] **Step 5: Verify remote synchronization**

Run:

```powershell
$localHead = git rev-parse HEAD
$remoteHead = git ls-remote origin refs/heads/feat/asset-index-foundation |
  ForEach-Object { ($_ -split "`t")[0] }
if ($localHead -ne $remoteHead) { throw "local and remote HEAD differ" }
git status --short --branch
```

Expected: local and remote hashes match and no tracked changes remain.

## Plan Self-Review

- Spec coverage: domain types, root-aware classification, guarded discovery, isolated issues, SQLite persistence, duplicate prevention, incremental updates, environment isolation, read-only verification, and delivery boundaries are assigned to Tasks 1-4.
- Placeholder scan: every implementation step names exact files, interfaces, commands, issue codes, schema behavior, and expected test results; no placeholder implementation remains.
- Type consistency: `AssetKind`, `AssetRootKind`, `AssetScanRoot`, `AssetObservation`, `AssetRecord`, `AssetUpsertOutcome`, `DiscoveryIssue`, `DiscoveryReport`, `discover_assets`, and `AssetRepository` retain the same names and meanings across tasks.
