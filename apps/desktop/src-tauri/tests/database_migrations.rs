use std::{path::Path, time::Duration};

use comfyneko_core::repositories::database::AppDatabase;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row,
};

const ENVIRONMENT_MIGRATION: &str = include_str!("../migrations/0001_environments.sql");
const ASSET_MIGRATION: &str = include_str!("../migrations/0002_assets.sql");

#[tokio::test]
async fn upgrades_a_legacy_database_without_losing_existing_rows() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("legacy-comfyneko.db");
    create_legacy_database(&database_path).await;

    let database = AppDatabase::connect_file(&database_path).await.unwrap();
    let environment_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM environment_profiles")
        .fetch_one(database.pool())
        .await
        .unwrap();
    let asset_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assets")
        .fetch_one(database.pool())
        .await
        .unwrap();
    let column_names = sqlx::query("PRAGMA table_info(assets)")
        .fetch_all(database.pool())
        .await
        .unwrap()
        .into_iter()
        .map(|row| row.get::<String, _>("name"))
        .collect::<Vec<_>>();
    let table_names = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(database.pool())
    .await
    .unwrap()
    .into_iter()
    .map(|row| row.get::<String, _>("name"))
    .collect::<Vec<_>>();

    assert_eq!(environment_count, 1);
    assert_eq!(asset_count, 1);
    assert!(column_names.contains(&"last_seen_scan_id".to_owned()));
    assert!(table_names.contains(&"asset_scan_tasks".to_owned()));
}

#[tokio::test]
async fn reopening_a_migrated_database_does_not_repeat_alter_table_statements() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("reopened-comfyneko.db");
    create_legacy_database(&database_path).await;

    let first = AppDatabase::connect_file(&database_path).await.unwrap();
    first.pool().close().await;
    let reopened = AppDatabase::connect_file(&database_path).await.unwrap();
    let migration_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(reopened.pool())
        .await
        .unwrap();

    assert_eq!(migration_count, 4);
}

#[tokio::test]
async fn upgrades_the_previous_scan_schema_without_replaying_existing_columns() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("previous-scan-schema.db");
    create_previous_scan_database(&database_path).await;

    let database = AppDatabase::connect_file(&database_path).await.unwrap();
    let asset = sqlx::query(
        r#"
        SELECT last_seen_scan_id, last_seen_at, is_present, missing_since
        FROM assets
        WHERE id = ?
        "#,
    )
    .bind("22222222-2222-4222-8222-222222222222")
    .fetch_one(database.pool())
    .await
    .unwrap();
    let old_scan_table_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'scan_jobs'",
    )
    .fetch_one(database.pool())
    .await
    .unwrap();

    assert_eq!(
        asset.get::<Option<String>, _>("last_seen_scan_id"),
        Some("33333333-3333-4333-8333-333333333333".to_owned())
    );
    assert_eq!(
        asset.get::<Option<String>, _>("last_seen_at"),
        Some("2026-09-04T00:00:00Z".to_owned())
    );
    assert_eq!(asset.get::<i64, _>("is_present"), 0);
    assert_eq!(
        asset.get::<Option<String>, _>("missing_since"),
        Some("2026-09-04T01:00:00Z".to_owned())
    );
    assert_eq!(old_scan_table_count, 1);
}

#[tokio::test]
async fn file_database_connections_enable_safe_concurrent_sqlite_settings() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("configured-comfyneko.db");
    let database = AppDatabase::connect_file(&database_path).await.unwrap();

    let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
        .fetch_one(database.pool())
        .await
        .unwrap();
    let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(database.pool())
        .await
        .unwrap();
    let busy_timeout: i64 = sqlx::query_scalar("PRAGMA busy_timeout")
        .fetch_one(database.pool())
        .await
        .unwrap();
    let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
        .fetch_one(database.pool())
        .await
        .unwrap();

    assert_eq!(journal_mode, "wal");
    assert_eq!(foreign_keys, 1);
    assert_eq!(
        Duration::from_millis(busy_timeout as u64),
        Duration::from_secs(5)
    );
    assert_eq!(synchronous, 1);
}

async fn create_legacy_database(path: &Path) {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();

    sqlx::raw_sql(ENVIRONMENT_MIGRATION)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql(ASSET_MIGRATION).execute(&pool).await.unwrap();
    sqlx::query(
        r#"
        INSERT INTO environment_profiles (
            id, name, comfy_root, roots_json
        ) VALUES (?, ?, ?, ?)
        "#,
    )
    .bind("11111111-1111-4111-8111-111111111111")
    .bind("旧环境")
    .bind(r"D:\ComfyUI")
    .bind(r#"{"models":[],"input":null,"output":null,"workflows":null,"custom_nodes":null}"#)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        r#"
        INSERT INTO assets (
            id, environment_id, root_kind, kind, normalized_path, size_bytes, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind("22222222-2222-4222-8222-222222222222")
    .bind("11111111-1111-4111-8111-111111111111")
    .bind("output")
    .bind("image")
    .bind(r"D:\ComfyUI\output\legacy.png")
    .bind(128_i64)
    .bind("2026-09-04T00:00:00Z")
    .execute(&pool)
    .await
    .unwrap();

    pool.close().await;
}

async fn create_previous_scan_database(path: &Path) {
    create_legacy_database(path).await;

    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();

    sqlx::raw_sql(
        r#"
        ALTER TABLE assets ADD COLUMN last_seen_scan_id TEXT;
        ALTER TABLE assets ADD COLUMN availability TEXT NOT NULL DEFAULT 'available';
        ALTER TABLE assets ADD COLUMN missing_since TEXT;

        CREATE TABLE scan_jobs (
            id TEXT PRIMARY KEY NOT NULL,
            environment_id TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        r#"
        UPDATE assets
        SET last_seen_scan_id = ?,
            availability = 'missing',
            missing_since = ?
        WHERE id = ?
        "#,
    )
    .bind("33333333-3333-4333-8333-333333333333")
    .bind("2026-09-04T01:00:00Z")
    .bind("22222222-2222-4222-8222-222222222222")
    .execute(&pool)
    .await
    .unwrap();

    pool.close().await;
}
