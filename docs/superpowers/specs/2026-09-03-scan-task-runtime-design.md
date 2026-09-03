# Persistent Scan Task Runtime Design

## 1. Goal

Build M2.2 as a persistent, read-only scan task runtime that can start a full environment scan, pause safely when cancellation is requested, survive application shutdown, and resume only after the user explicitly chooses to continue.

A scan may update ComfyNeko's own SQLite index and task tables. It must never create, rename, move, delete, rewrite, or change permissions or timestamps under a bound ComfyUI or external asset directory.

## 2. Chosen Approach

Use a SQLite-backed directory queue.

Each job persists the directories still waiting to be scanned. The worker processes one bounded directory batch at a time, commits observations and progress, then checks the cancellation flag before taking more work. This avoids keeping an entire asset tree in memory and gives restart recovery an exact source of truth.

Rejected alternatives:

- In-memory worker plus a single path cursor: simpler, but a changed directory tree can make the cursor ambiguous and recovery unreliable.
- Enumerate every file into a snapshot table before indexing: easy to resume, but delays useful progress and creates a large up-front database write.

## 3. Scope

### Included

- Persistent scan jobs and directory queue rows.
- Job states, counters, timestamps, cancellation request, pause reason, and fatal error text.
- A full-environment scan containing every configured input, output, model, and workflow root.
- One active or resumable job per environment.
- Bounded directory batches.
- User-requested cancellation that pauses after the current directory transaction.
- Startup recovery that converts interrupted `running` jobs to `paused`.
- Explicit user-triggered resume; application startup never resumes disk scanning automatically.
- Per-path issue persistence without aborting other directories.
- Asset observations associated with the current scan job.
- Missing-asset marking only after a complete successful full-environment scan.
- Tauri commands for start, cancel, resume, and job listing.
- Progress events emitted after committed state changes.
- Automated tests using temporary directories and SQLite files.

### Excluded

- An asset-library UI.
- A scan-task UI beyond APIs and events.
- Concurrent workers or parallel scanning.
- Partial-root scans.
- Permanent deletion of scan jobs or queue history.
- File watchers.
- Hashing, thumbnails, media metadata, workflow parsing, remote metadata, favorites, tags, or FTS5.
- Automatic retry loops for fatal database failures.
- Automatic resume after application restart.

## 4. Job State Model

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
```

State transitions:

```text
start                         resume
  │                              │
  ▼                              ▼
queued ───────► running ◄────── paused
                  │   │
     cancel flag  │   ├────────► failed
                  ▼
                paused
                  │
                  └────────────► completed
```

Rules:

- `queued` may transition to `running`.
- `running` may transition to `paused`, `completed`, or `failed`.
- `paused` may transition to `queued` only through an explicit resume command.
- `completed` and `failed` are terminal in this milestone.
- A cancellation request sets `cancel_requested = true`; the worker completes its current directory transaction, resets any claimed queue row to `pending`, and then changes the job to `paused` with `UserRequested`.
- During startup recovery, every persisted `running` job becomes `paused` with `ApplicationInterrupted`, and any `processing` directory becomes `pending`.

## 5. Database Schema

Add `0003_scan_tasks.sql`.

The existing migration runner must first become version-aware. It creates:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
);
```

On an existing database without this ledger, migrations `0001` and `0002` are safely re-executed because they contain only `CREATE ... IF NOT EXISTS`, then recorded as applied. Migration `0003` is executed and recorded once inside its own transaction. This makes the `ALTER TABLE` statements below safe across later application restarts.

### `scan_jobs`

```sql
CREATE TABLE scan_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    environment_id TEXT NOT NULL,
    status TEXT NOT NULL,
    pause_reason TEXT,
    cancel_requested INTEGER NOT NULL DEFAULT 0,
    queued_directories INTEGER NOT NULL DEFAULT 0,
    completed_directories INTEGER NOT NULL DEFAULT 0,
    discovered_assets INTEGER NOT NULL DEFAULT 0,
    issue_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    updated_at TEXT NOT NULL,
    finished_at TEXT,
    last_error TEXT,
    FOREIGN KEY(environment_id) REFERENCES environment_profiles(id) ON DELETE CASCADE
);
```

Use a partial unique index so an environment can have only one `queued`, `running`, or `paused` job:

```sql
CREATE UNIQUE INDEX idx_scan_jobs_one_open_per_environment
ON scan_jobs(environment_id)
WHERE status IN ('queued', 'running', 'paused');
```

### `scan_roots`

```sql
CREATE TABLE scan_roots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    root_kind TEXT NOT NULL,
    root_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES scan_jobs(id) ON DELETE CASCADE,
    UNIQUE(job_id, root_kind, root_path)
);
```

This table is the immutable root snapshot used by the job. Child queue entries always retain a reference to their original allowed root.

### `scan_queue`

```sql
CREATE TABLE scan_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    scan_root_id INTEGER NOT NULL,
    directory_path TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES scan_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY(scan_root_id) REFERENCES scan_roots(id) ON DELETE CASCADE,
    UNIQUE(scan_root_id, directory_path)
);
```

Queue states are `pending`, `processing`, and `completed`.

### `scan_issues`

```sql
CREATE TABLE scan_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    path TEXT NOT NULL,
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES scan_jobs(id) ON DELETE CASCADE
);
```

### Asset scan markers

Extend `assets`:

```sql
ALTER TABLE assets ADD COLUMN last_seen_scan_id TEXT;
ALTER TABLE assets ADD COLUMN availability TEXT NOT NULL DEFAULT 'available';
ALTER TABLE assets ADD COLUMN missing_since TEXT;
```

`availability` supports `available` and `missing`. Assets are not deleted when they disappear.

## 6. Full-Environment Root Snapshot

A job captures its root set when it is created. The queue receives the canonicalized input, output, model, and workflow roots from the saved environment profile.

The job is a full-environment scan:

- every configured supported root is included;
- nonexistent and unreadable roots become persisted issues;
- the queue still processes remaining valid roots;
- roots added to the environment after job creation are included only in the next new job;
- roots removed after job creation remain part of the current job snapshot.

Custom-node directories are not asset roots in this milestone.

## 7. Directory Batch Processing

Refactor the existing recursive scanner into a reusable one-directory operation:

```rust
pub struct DirectoryDiscovery {
    pub observations: Vec<AssetObservation>,
    pub child_directories: Vec<PathBuf>,
    pub issues: Vec<DiscoveryIssue>,
}

pub fn discover_directory(
    environment_id: Uuid,
    root_kind: AssetRootKind,
    allowed_root: &Path,
    directory: &Path,
) -> DirectoryDiscovery;
```

The persistent worker:

1. loads one `pending` directory and marks it `processing`;
2. checks that the directory remains beneath its canonical allowed root;
3. performs read-only direct-child discovery;
4. opens a transaction;
5. upserts discovered assets with `last_seen_scan_id = job.id` and `availability = available`;
6. inserts child directories as `pending`;
7. inserts isolated issues;
8. marks the directory `completed`;
9. refreshes job counters;
10. commits;
11. emits a progress event;
12. checks `cancel_requested` before claiming another directory.

The first implementation processes one job and one directory at a time. A batch API may repeat this bounded operation up to a small configured maximum, but a single transaction never covers multiple directories.

## 8. Cancellation and Recovery

Cancellation is cooperative and database-backed:

- `cancel_scan(job_id)` only sets the cancellation flag.
- No filesystem operation is forcibly interrupted.
- The current directory transaction finishes or rolls back normally.
- Before the next directory claim, the worker changes the job to `paused`.
- Already completed directories and indexed observations remain committed.
- Pending queue rows remain available for resume.

Startup recovery:

- Tauri setup calls `recover_interrupted_jobs`.
- It resets `processing` queue rows to `pending`.
- It changes `running` jobs to `paused` with `ApplicationInterrupted`.
- It emits no filesystem work.
- The user must call `resume_scan(job_id)` to continue.

Resume:

- only a `paused` job can resume;
- the cancellation flag and pause reason are cleared;
- status returns to `queued`;
- the worker starts from persisted pending directories;
- completed queue rows are not repeated.

## 9. Completion and Missing Assets

The worker declares completion only when:

- there are no `pending` or `processing` queue rows;
- all committed directory operations succeeded;
- the job has not been cancelled;
- no fatal repository error occurred.

In the same final transaction:

1. mark every asset for the environment with `last_seen_scan_id = job.id` as `available` and clear `missing_since`;
2. mark every other indexed asset for the environment as `missing`;
3. set `missing_since` only when the asset first changes from available to missing;
4. set the job to `completed`.

Paused or failed scans never mark assets missing.

## 10. Service and Tauri Boundary

Create a pure Rust `ScanTaskService` responsible for state transitions and directory processing. Tauri commands are thin adapters:

```rust
start_scan(environment_id: Uuid) -> ScanJob
cancel_scan(job_id: Uuid) -> ScanJob
resume_scan(job_id: Uuid) -> ScanJob
list_scan_jobs(environment_id: Option<Uuid>) -> Vec<ScanJob>
```

The service reads the saved environment profile from SQLite. Callers cannot supply unrestricted arbitrary scan paths.

Progress events use one stable name:

```text
scan://progress
```

The payload is the latest serialized `ScanJob`. No file contents, prompts, tokens, or private metadata are emitted.

## 11. Error Handling

- Per-path filesystem failures become `scan_issues` and do not fail the job.
- Missing or invalid environment IDs reject job creation.
- A second open job for the same environment returns a stable conflict error.
- Invalid state transitions return machine-readable service errors.
- A fatal SQLite failure sets the job to `failed` when possible and stops the worker.
- Panics are not used for expected filesystem, state, or database failures.
- Queue claims and directory completion use transactions so restart cannot silently lose pending work.

## 12. Testing

Automated tests must prove:

1. starting a job stores the full environment root snapshot;
2. only one open job is allowed per environment;
3. one directory batch discovers files, enqueues child directories, and updates counters;
4. cancellation pauses after the current directory and preserves pending work;
5. startup recovery changes running jobs to paused without reading the filesystem;
6. resume continues pending directories and does not repeat completed directories;
7. completed scans mark unseen assets missing;
8. paused and failed scans never mark assets missing;
9. a later successful scan restores a previously missing asset to available;
10. per-path issues do not prevent job completion;
11. Tauri command adapters expose only saved-environment scans;
12. existing asset, environment, frontend, live smoke, Clippy, and Tauri build gates remain green.

## 13. Deferred Model Subclassification

M2.2 keeps `AssetKind::Model` unchanged.

The following model-specific fields are explicitly deferred to the media/model library milestone:

- model type: Checkpoint, Diffusion Model, LoRA/LyCORIS, VAE, Text Encoder/CLIP, CLIP Vision, ControlNet, Upscaler, Embedding, Style Model, GLIGEN, Hypernetwork, Unknown;
- model format: SafeTensors, CKPT, PyTorch, GGUF, ONNX, other;
- architecture: SD 1.x, SDXL, Flux, SD3, Wan, Hunyuan, Qwen, and future architectures;
- classification source and confidence: directory mapping, file header, local metadata, remote metadata, or manual override.

Directory mapping and bounded SafeTensors-header inspection will be designed separately. File extension alone must never be treated as reliable model subtype evidence.

## 14. Delivery Boundary

The M2.2 implementation will include migrations, domain types, repository/service code, Tauri commands/events, tests, milestone documentation, and ignored local verification evidence.

It will not include an asset UI, scan-task UI, generated databases, user media, caches, model files, or automatic startup scanning.
