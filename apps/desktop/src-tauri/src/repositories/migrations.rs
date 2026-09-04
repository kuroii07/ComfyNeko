use std::{error::Error, fmt};

use sqlx::{migrate::MigrateError, Row, SqlitePool};

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[derive(Debug)]
pub enum MigrationError {
    Database(sqlx::Error),
    Versioned(MigrateError),
}

pub async fn run(pool: &SqlitePool) -> Result<(), MigrationError> {
    MIGRATOR
        .run(pool)
        .await
        .map_err(MigrationError::Versioned)?;
    ensure_asset_presence_columns(pool).await?;

    Ok(())
}

async fn ensure_asset_presence_columns(pool: &SqlitePool) -> Result<(), MigrationError> {
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(MigrationError::Database)?;
    let columns = sqlx::query("PRAGMA table_info(assets)")
        .fetch_all(&mut *transaction)
        .await
        .map_err(MigrationError::Database)?;
    let column_names = columns
        .iter()
        .map(|row| row.get::<String, _>("name"))
        .collect::<Vec<_>>();
    let has_legacy_availability = column_names.iter().any(|name| name == "availability");
    let added_last_seen_at = !column_names.iter().any(|name| name == "last_seen_at");
    let added_is_present = !column_names.iter().any(|name| name == "is_present");

    add_column_if_missing(
        &mut transaction,
        &column_names,
        "last_seen_scan_id",
        "ALTER TABLE assets ADD COLUMN last_seen_scan_id TEXT",
    )
    .await?;
    add_column_if_missing(
        &mut transaction,
        &column_names,
        "last_seen_at",
        "ALTER TABLE assets ADD COLUMN last_seen_at TEXT",
    )
    .await?;
    add_column_if_missing(
        &mut transaction,
        &column_names,
        "is_present",
        "ALTER TABLE assets ADD COLUMN is_present INTEGER NOT NULL DEFAULT 1",
    )
    .await?;
    add_column_if_missing(
        &mut transaction,
        &column_names,
        "missing_since",
        "ALTER TABLE assets ADD COLUMN missing_since TEXT",
    )
    .await?;

    if added_last_seen_at && column_names.iter().any(|name| name == "last_seen_scan_id") {
        sqlx::query(
            "UPDATE assets SET last_seen_at = indexed_at WHERE last_seen_scan_id IS NOT NULL",
        )
        .execute(&mut *transaction)
        .await
        .map_err(MigrationError::Database)?;
    }

    if added_is_present && has_legacy_availability {
        sqlx::query(
            r#"
            UPDATE assets
            SET is_present = CASE
                WHEN LOWER(availability) = 'missing' THEN 0
                ELSE 1
            END
            "#,
        )
        .execute(&mut *transaction)
        .await
        .map_err(MigrationError::Database)?;
    }

    transaction.commit().await.map_err(MigrationError::Database)
}

async fn add_column_if_missing(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    column_names: &[String],
    column_name: &str,
    statement: &str,
) -> Result<(), MigrationError> {
    if column_names.iter().any(|name| name == column_name) {
        return Ok(());
    }

    sqlx::query(statement)
        .execute(&mut **transaction)
        .await
        .map_err(MigrationError::Database)?;

    Ok(())
}

impl fmt::Display for MigrationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(formatter, "兼容旧数据库结构失败：{error}"),
            Self::Versioned(error) => write!(formatter, "执行版本化迁移失败：{error}"),
        }
    }
}

impl Error for MigrationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Database(error) => Some(error),
            Self::Versioned(error) => Some(error),
        }
    }
}
