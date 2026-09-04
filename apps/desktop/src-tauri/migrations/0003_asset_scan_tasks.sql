-- Asset presence columns are added by the compatibility step in
-- repositories::migrations. Earlier development builds shipped a partially
-- overlapping scan schema without SQLx migration records, so unconditional
-- ALTER TABLE statements here would make those databases impossible to open.

CREATE TABLE asset_scan_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    environment_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN (
            'queued',
            'running',
            'cancelling',
            'paused',
            'interrupted',
            'completed',
            'completed_with_issues',
            'failed'
        )
    ),
    roots_json TEXT NOT NULL,
    processed_directories INTEGER NOT NULL DEFAULT 0,
    discovered_assets INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    unchanged_count INTEGER NOT NULL DEFAULT 0,
    invalidated_count INTEGER NOT NULL DEFAULT 0,
    issue_count INTEGER NOT NULL DEFAULT 0,
    current_path TEXT,
    cancel_requested_at TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    updated_at TEXT NOT NULL,
    finished_at TEXT,
    FOREIGN KEY(environment_id) REFERENCES environment_profiles(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_asset_scan_tasks_one_active_per_environment
    ON asset_scan_tasks(environment_id)
    WHERE status IN ('queued', 'running', 'cancelling', 'paused', 'interrupted');

CREATE INDEX idx_asset_scan_tasks_environment_updated
    ON asset_scan_tasks(environment_id, updated_at DESC);

CREATE TABLE asset_scan_directories (
    task_id TEXT NOT NULL,
    root_kind TEXT NOT NULL,
    root_path TEXT NOT NULL,
    directory_path TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'processing', 'done')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(task_id, root_kind, directory_path),
    FOREIGN KEY(task_id) REFERENCES asset_scan_tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_asset_scan_directories_task_state
    ON asset_scan_directories(task_id, state, directory_path);

CREATE TABLE asset_scan_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    path TEXT NOT NULL,
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES asset_scan_tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_asset_scan_issues_task
    ON asset_scan_issues(task_id, id);
