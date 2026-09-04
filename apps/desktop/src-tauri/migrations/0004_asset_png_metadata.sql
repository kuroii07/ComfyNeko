CREATE TABLE asset_png_metadata (
    asset_id TEXT PRIMARY KEY NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    parser_version TEXT NOT NULL,
    source_size_bytes INTEGER NOT NULL,
    source_modified_at TEXT NOT NULL,
    parse_state TEXT NOT NULL CHECK (parse_state IN ('available', 'empty', 'invalid')),
    prompt_text TEXT,
    workflow_text TEXT,
    parsed_at TEXT NOT NULL
);
