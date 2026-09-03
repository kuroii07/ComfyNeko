# Asset Index Foundation Design

## 1. Goal

Build the first Phase 1 backend milestone for ComfyNeko: discover supported files inside an environment's approved asset roots, classify them, and persist a duplicate-free local inventory without modifying any bound ComfyUI file.

This milestone establishes the data and safety boundaries required by later asset browsing, metadata parsing, thumbnails, hashing, search, and task management. It does not expose a new asset-library screen yet.

## 2. Scope

### Included

- An `Asset` domain model linked to an `EnvironmentProfile`.
- Asset kinds for image, video, audio, model, and workflow files.
- A root-role model identifying whether a discovered file came from an input, output, model, or workflow root.
- Case-insensitive extension classification.
- Recursive, read-only discovery under explicitly supplied environment roots.
- Protection against symlink directory traversal and canonical-path escape.
- Per-entry error isolation so one unreadable or vanished entry does not abort the scan.
- SQLite migration and repository operations for insert, update, unchanged detection, and listing.
- Duplicate prevention through a unique `(environment_id, normalized_path)` constraint.
- Incremental comparison using normalized path, byte size, and modified timestamp.
- Automated tests for classification, path containment, duplicate rescans, changed files, environment isolation, and partial scan errors.

### Excluded

- Frontend asset-library pages.
- Thumbnail, video-cover, or waveform generation.
- PNG metadata, workflow graph, prompt, or sidecar parsing.
- Full SHA-256 hashing and moved-file detection.
- File watchers.
- Background task queue, cancellation, and resume checkpoints.
- Favorites, tags, FTS5 search, remote metadata, or model enrichment.
- File deletion, movement, renaming, rewriting, or permission changes.

## 3. Architecture

The milestone adds three focused Rust layers:

1. `domain::asset` defines durable asset facts and scan result types.
2. `services::asset_discovery` performs read-only traversal, containment checks, extension classification, and error collection.
3. `repositories::asset_repository` stores discovered facts and decides whether each observation is inserted, updated, or unchanged.

Discovery never writes to a bound root. SQLite writes occur only in ComfyNeko's own database. The scanner returns observations first; repository persistence is a separate explicit call so later task orchestration can add cancellation and batching without coupling filesystem traversal to SQL.

## 4. Domain Model

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

pub struct DiscoveryIssue {
    pub path: PathBuf,
    pub code: String,
    pub message: String,
}

pub struct DiscoveryReport {
    pub observations: Vec<AssetObservation>,
    pub issues: Vec<DiscoveryIssue>,
}
```

`AssetRecord.id` is created only for the first insertion. Re-observing the same environment and normalized path preserves the existing ID. A future full content fingerprint may relate moved or duplicated files, but it is not part of this milestone.

## 5. Classification Rules

Extension matching is ASCII case-insensitive.

- Image: `png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`, `tif`, `tiff`, `avif`
- Video: `mp4`, `webm`, `mov`, `mkv`, `avi`
- Audio: `wav`, `mp3`, `flac`, `ogg`, `m4a`, `aac`
- Model: `safetensors`, `ckpt`, `pt`, `pth`, `bin`
- Workflow: `json`

Unknown extensions are ignored rather than stored as generic assets. Classification depends on both root role and extension: model roots accept model files, workflow roots accept JSON, and input/output roots accept image, video, and audio. This prevents an arbitrary JSON or binary file from being mislabeled solely by extension.

## 6. Read-Only Discovery Boundary

- Each root must exist, be a directory, and be canonicalized before traversal.
- The scanner uses directory reads and metadata reads only.
- Directory symlinks and junction-like reparse targets are not followed in this milestone.
- Every discovered file is canonicalized and must remain beneath the canonical root.
- A file that disappears between directory enumeration and metadata lookup becomes a `DiscoveryIssue`; the remaining scan continues.
- An unreadable directory or file becomes a `DiscoveryIssue`; it does not terminate other roots.
- Results are sorted by normalized path for deterministic tests and persistence order.
- No directory is created and no source file timestamp, permission, name, or content is changed.

## 7. SQLite Schema

Add a forward-only `0002_assets.sql` migration containing:

```sql
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY NOT NULL,
    environment_id TEXT NOT NULL,
    root_kind TEXT NOT NULL,
    kind TEXT NOT NULL,
    normalized_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    modified_at TEXT,
    fingerprint TEXT,
    indexed_at TEXT NOT NULL,
    FOREIGN KEY(environment_id) REFERENCES environment_profiles(id) ON DELETE CASCADE,
    UNIQUE(environment_id, normalized_path)
);

CREATE INDEX IF NOT EXISTS idx_assets_environment_kind
    ON assets(environment_id, kind);
```

The repository runs all migrations when opening the existing `comfyneko.db`. It must not replace or reinterpret existing environment records.

## 8. Incremental Semantics

For each observation:

- No existing `(environment_id, normalized_path)`: insert a new record.
- Existing record with different `size_bytes`, `modified_at`, `kind`, or `root_kind`: update mutable facts while preserving `id`.
- Existing record with identical facts: return `Unchanged` and avoid an unnecessary SQL update.

This milestone does not remove records missing from a later scan because reliable stale-record cleanup requires a completed-scan boundary and resumable task state. That behavior belongs to the next milestone.

## 9. Error Handling

- Domain conversion failures return typed repository errors.
- Invalid database rows report asset-specific data errors.
- Filesystem issues are accumulated in `DiscoveryReport.issues`.
- Invalid or escaping roots are rejected before traversal.
- Numeric conversion must reject file sizes that cannot be represented by SQLite's signed integer range.
- No scan issue may panic the process or discard valid observations collected from other entries.

## 10. Verification

The implementation is accepted when automated tests prove:

1. Supported extensions classify correctly and unsupported files are ignored.
2. A valid temporary root is discovered recursively without writes.
3. A directory symlink is not traversed.
4. One broken entry is reported while other assets remain discoverable where the platform permits constructing the fixture.
5. Repeating the same scan does not create duplicate database rows.
6. Changing size or mtime updates the existing record while preserving its ID.
7. Identical paths in two environment IDs remain separate records.
8. Existing environment repository tests and the real read-only environment smoke still pass.
9. `cargo fmt --check`, `cargo clippy -p comfyneko-core --all-targets -- -D warnings`, `cargo test -p comfyneko-core`, frontend tests, frontend build, Tauri debug no-bundle build, and `git diff --check` pass.

## 11. Delivery Boundary

The implementation commit will include Rust source, migration, tests, README milestone status, roadmap updates, and the development log. It will not include generated databases, cached metadata, scanned user files, build outputs, or ignored smoke evidence.

The next milestone after this design is background scan task orchestration with cancellation, persisted checkpoints, completed-scan stale detection, and resume behavior.
