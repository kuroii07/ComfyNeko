CREATE TABLE IF NOT EXISTS environment_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    comfy_root TEXT NOT NULL,
    python_executable TEXT,
    api_host TEXT,
    api_port INTEGER,
    roots_json TEXT NOT NULL,
    last_validated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_environment_profiles_name
    ON environment_profiles(name);
