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
