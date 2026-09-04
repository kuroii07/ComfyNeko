use std::{
    error::Error,
    fmt,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqliteRow, Row, Sqlite, SqlitePool, Transaction};
use uuid::Uuid;

use crate::domain::asset::{
    AssetAvailability, AssetKind, AssetListItem, AssetObservation, AssetPage, AssetQuery,
    AssetRecord, AssetRootKind, AssetUpsertOutcome,
};

use super::{database::AppDatabase, migrations};

#[derive(Clone)]
pub struct AssetRepository {
    pool: SqlitePool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetRepositoryError {
    message: String,
}

pub(crate) struct AssetScanWitness {
    pub task_id: Uuid,
    pub seen_at: DateTime<Utc>,
}

impl AssetRepository {
    pub async fn connect_in_memory() -> Result<Self, AssetRepositoryError> {
        let database = AppDatabase::connect_in_memory()
            .await
            .map_err(AssetRepositoryError::database)?;

        Ok(Self {
            pool: database.pool().clone(),
        })
    }

    pub async fn connect_file(
        database_path: impl AsRef<Path>,
    ) -> Result<Self, AssetRepositoryError> {
        let database = AppDatabase::connect_file(database_path)
            .await
            .map_err(AssetRepositoryError::database)?;

        Ok(Self {
            pool: database.pool().clone(),
        })
    }

    pub async fn from_pool(pool: SqlitePool) -> Result<Self, AssetRepositoryError> {
        migrations::run(&pool)
            .await
            .map_err(AssetRepositoryError::database)?;

        Ok(Self { pool })
    }

    pub async fn upsert(
        &self,
        observation: &AssetObservation,
    ) -> Result<AssetUpsertOutcome, AssetRepositoryError> {
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetRepositoryError::database)?;
        let outcome = upsert_in_transaction(&mut transaction, observation, None).await?;
        transaction
            .commit()
            .await
            .map_err(AssetRepositoryError::database)?;

        Ok(outcome)
    }

    pub async fn list_for_environment(
        &self,
        environment_id: Uuid,
    ) -> Result<Vec<AssetRecord>, AssetRepositoryError> {
        let rows = sqlx::query(
            r#"
            SELECT id, environment_id, root_kind, kind, normalized_path, size_bytes,
                   modified_at, fingerprint, indexed_at
            FROM assets
            WHERE environment_id = ?
            ORDER BY normalized_path COLLATE NOCASE ASC
            "#,
        )
        .bind(environment_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(AssetRepositoryError::database)?;

        rows.into_iter().map(AssetRecord::try_from).collect()
    }

    pub async fn get(&self, id: Uuid) -> Result<Option<AssetListItem>, AssetRepositoryError> {
        sqlx::query(
            r#"
            SELECT id, environment_id, root_kind, kind, normalized_path, size_bytes,
                   modified_at, fingerprint, indexed_at, last_seen_at, is_present,
                   missing_since
            FROM assets
            WHERE id = ?
            "#,
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(AssetRepositoryError::database)?
        .map(AssetListItem::try_from)
        .transpose()
    }

    pub async fn query(&self, query: &AssetQuery) -> Result<AssetPage, AssetRepositoryError> {
        if query.page == 0 || query.page_size == 0 {
            return Err(AssetRepositoryError::data(
                "asset query page and page size must be greater than zero",
            ));
        }

        let environment_id = query.environment_id.to_string();
        let kind = query.kind.map(|value| value.as_str().to_owned());
        let root_kind = query.root_kind.map(|value| value.as_str().to_owned());
        let availability = query.availability.map(AssetAvailability::as_database_value);
        let (directory_marker, windows_pattern, unix_pattern) = query
            .directory
            .as_ref()
            .map(|directory| directory_patterns(directory))
            .transpose()?
            .map(|(windows, unix)| (Some(String::new()), Some(windows), Some(unix)))
            .unwrap_or((None, None, None));
        let search_pattern = query.search.as_deref().map(search_pattern).transpose()?;
        let mut transaction = self
            .pool
            .begin()
            .await
            .map_err(AssetRepositoryError::database)?;

        let total_items = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)
            FROM assets
            WHERE environment_id = ?
              AND (? IS NULL OR kind = ?)
              AND (? = 0 OR kind IN ('image', 'video', 'audio'))
              AND (? IS NULL OR root_kind = ?)
              AND (? IS NULL OR is_present = ?)
              AND (
                    ? IS NULL
                    OR normalized_path COLLATE NOCASE LIKE ? ESCAPE '!'
                    OR normalized_path COLLATE NOCASE LIKE ? ESCAPE '!'
              )
              AND (? IS NULL OR normalized_path COLLATE NOCASE LIKE ? ESCAPE '!')
            "#,
        )
        .bind(&environment_id)
        .bind(&kind)
        .bind(&kind)
        .bind(query.media_only)
        .bind(&root_kind)
        .bind(&root_kind)
        .bind(availability)
        .bind(availability)
        .bind(&directory_marker)
        .bind(&windows_pattern)
        .bind(&unix_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .fetch_one(&mut *transaction)
        .await
        .map_err(AssetRepositoryError::database)?;
        let total_items = u64::try_from(total_items).map_err(AssetRepositoryError::data)?;
        let offset = u64::from(query.page - 1)
            .checked_mul(u64::from(query.page_size))
            .ok_or_else(|| AssetRepositoryError::data("asset query offset overflow"))?;
        let limit = i64::from(query.page_size);
        let offset = i64::try_from(offset).map_err(AssetRepositoryError::data)?;

        let rows = sqlx::query(
            r#"
            SELECT id, environment_id, root_kind, kind, normalized_path, size_bytes,
                   modified_at, fingerprint, indexed_at, last_seen_at, is_present,
                   missing_since
            FROM assets
            WHERE environment_id = ?
              AND (? IS NULL OR kind = ?)
              AND (? = 0 OR kind IN ('image', 'video', 'audio'))
              AND (? IS NULL OR root_kind = ?)
              AND (? IS NULL OR is_present = ?)
              AND (
                    ? IS NULL
                    OR normalized_path COLLATE NOCASE LIKE ? ESCAPE '!'
                    OR normalized_path COLLATE NOCASE LIKE ? ESCAPE '!'
              )
              AND (? IS NULL OR normalized_path COLLATE NOCASE LIKE ? ESCAPE '!')
            ORDER BY normalized_path COLLATE NOCASE ASC, normalized_path ASC, id ASC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(environment_id)
        .bind(&kind)
        .bind(&kind)
        .bind(query.media_only)
        .bind(&root_kind)
        .bind(&root_kind)
        .bind(availability)
        .bind(availability)
        .bind(directory_marker)
        .bind(windows_pattern)
        .bind(unix_pattern)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(&mut *transaction)
        .await
        .map_err(AssetRepositoryError::database)?;
        transaction
            .commit()
            .await
            .map_err(AssetRepositoryError::database)?;
        let items = rows
            .into_iter()
            .map(AssetListItem::try_from)
            .collect::<Result<Vec<_>, _>>()?;
        let total_pages = if total_items == 0 {
            0
        } else {
            total_items.div_ceil(u64::from(query.page_size))
        };

        Ok(AssetPage {
            items,
            page: query.page,
            page_size: query.page_size,
            total_items,
            total_pages,
        })
    }
}

pub(crate) async fn upsert_in_transaction(
    transaction: &mut Transaction<'_, Sqlite>,
    observation: &AssetObservation,
    witness: Option<&AssetScanWitness>,
) -> Result<AssetUpsertOutcome, AssetRepositoryError> {
    let normalized_path = observation.normalized_path.to_string_lossy().to_string();
    let existing = sqlx::query(
        r#"
        SELECT id, environment_id, root_kind, kind, normalized_path, size_bytes,
               modified_at, fingerprint, indexed_at
        FROM assets
        WHERE environment_id = ? AND normalized_path = ?
        "#,
    )
    .bind(observation.environment_id.to_string())
    .bind(&normalized_path)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(AssetRepositoryError::database)?
    .map(AssetRecord::try_from)
    .transpose()?;

    if let Some(existing) = existing {
        if existing.observation == *observation {
            if let Some(witness) = witness {
                sqlx::query(
                    r#"
                    UPDATE assets
                    SET last_seen_scan_id = ?,
                        last_seen_at = ?,
                        is_present = 1,
                        missing_since = NULL
                    WHERE id = ?
                    "#,
                )
                .bind(witness.task_id.to_string())
                .bind(witness.seen_at.to_rfc3339())
                .bind(existing.id.to_string())
                .execute(&mut **transaction)
                .await
                .map_err(AssetRepositoryError::database)?;
            }

            return Ok(AssetUpsertOutcome::Unchanged(existing));
        }

        let indexed_at = Utc::now();
        let scan_id = witness.map(|value| value.task_id.to_string());
        let seen_at = witness.map(|value| value.seen_at.to_rfc3339());
        sqlx::query(
            r#"
            UPDATE assets
            SET root_kind = ?,
                kind = ?,
                size_bytes = ?,
                modified_at = ?,
                indexed_at = ?,
                last_seen_scan_id = COALESCE(?, last_seen_scan_id),
                last_seen_at = COALESCE(?, last_seen_at),
                is_present = CASE WHEN ? IS NULL THEN is_present ELSE 1 END,
                missing_since = CASE WHEN ? IS NULL THEN missing_since ELSE NULL END
            WHERE id = ?
            "#,
        )
        .bind(observation.root_kind.as_str())
        .bind(observation.kind.as_str())
        .bind(size_for_database(observation.size_bytes)?)
        .bind(timestamp_for_database(observation.modified_at))
        .bind(indexed_at.to_rfc3339())
        .bind(&scan_id)
        .bind(&seen_at)
        .bind(&scan_id)
        .bind(&scan_id)
        .bind(existing.id.to_string())
        .execute(&mut **transaction)
        .await
        .map_err(AssetRepositoryError::database)?;

        return Ok(AssetUpsertOutcome::Updated(AssetRecord {
            id: existing.id,
            observation: observation.clone(),
            fingerprint: existing.fingerprint,
            indexed_at,
        }));
    }

    let record = AssetRecord {
        id: Uuid::new_v4(),
        observation: observation.clone(),
        fingerprint: None,
        indexed_at: Utc::now(),
    };
    sqlx::query(
        r#"
        INSERT INTO assets (
            id, environment_id, root_kind, kind, normalized_path, size_bytes,
            modified_at, fingerprint, indexed_at, last_seen_scan_id, last_seen_at,
            is_present, missing_since
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
        "#,
    )
    .bind(record.id.to_string())
    .bind(record.observation.environment_id.to_string())
    .bind(record.observation.root_kind.as_str())
    .bind(record.observation.kind.as_str())
    .bind(normalized_path)
    .bind(size_for_database(record.observation.size_bytes)?)
    .bind(timestamp_for_database(record.observation.modified_at))
    .bind(&record.fingerprint)
    .bind(record.indexed_at.to_rfc3339())
    .bind(witness.map(|value| value.task_id.to_string()))
    .bind(witness.map(|value| value.seen_at.to_rfc3339()))
    .execute(&mut **transaction)
    .await
    .map_err(AssetRepositoryError::database)?;

    Ok(AssetUpsertOutcome::Inserted(record))
}

impl TryFrom<SqliteRow> for AssetRecord {
    type Error = AssetRepositoryError;

    fn try_from(row: SqliteRow) -> Result<Self, Self::Error> {
        let id: String = row.try_get("id").map_err(AssetRepositoryError::database)?;
        let environment_id: String = row
            .try_get("environment_id")
            .map_err(AssetRepositoryError::database)?;
        let root_kind: String = row
            .try_get("root_kind")
            .map_err(AssetRepositoryError::database)?;
        let kind: String = row
            .try_get("kind")
            .map_err(AssetRepositoryError::database)?;
        let size_bytes: i64 = row
            .try_get("size_bytes")
            .map_err(AssetRepositoryError::database)?;
        let modified_at: Option<String> = row
            .try_get("modified_at")
            .map_err(AssetRepositoryError::database)?;
        let indexed_at: String = row
            .try_get("indexed_at")
            .map_err(AssetRepositoryError::database)?;

        Ok(Self {
            id: Uuid::parse_str(&id).map_err(AssetRepositoryError::data)?,
            observation: AssetObservation {
                environment_id: Uuid::parse_str(&environment_id)
                    .map_err(AssetRepositoryError::data)?,
                root_kind: AssetRootKind::parse(&root_kind).ok_or_else(|| {
                    AssetRepositoryError::data(format!("unknown asset root kind: {root_kind}"))
                })?,
                normalized_path: PathBuf::from(
                    row.try_get::<String, _>("normalized_path")
                        .map_err(AssetRepositoryError::database)?,
                ),
                kind: AssetKind::parse(&kind).ok_or_else(|| {
                    AssetRepositoryError::data(format!("unknown asset kind: {kind}"))
                })?,
                size_bytes: u64::try_from(size_bytes).map_err(AssetRepositoryError::data)?,
                modified_at: modified_at
                    .map(|value| {
                        DateTime::parse_from_rfc3339(&value).map(|time| time.with_timezone(&Utc))
                    })
                    .transpose()
                    .map_err(AssetRepositoryError::data)?,
            },
            fingerprint: row
                .try_get("fingerprint")
                .map_err(AssetRepositoryError::database)?,
            indexed_at: DateTime::parse_from_rfc3339(&indexed_at)
                .map(|time| time.with_timezone(&Utc))
                .map_err(AssetRepositoryError::data)?,
        })
    }
}

impl TryFrom<SqliteRow> for AssetListItem {
    type Error = AssetRepositoryError;

    fn try_from(row: SqliteRow) -> Result<Self, Self::Error> {
        let id: String = row.try_get("id").map_err(AssetRepositoryError::database)?;
        let environment_id: String = row
            .try_get("environment_id")
            .map_err(AssetRepositoryError::database)?;
        let root_kind: String = row
            .try_get("root_kind")
            .map_err(AssetRepositoryError::database)?;
        let kind: String = row
            .try_get("kind")
            .map_err(AssetRepositoryError::database)?;
        let normalized_path = PathBuf::from(
            row.try_get::<String, _>("normalized_path")
                .map_err(AssetRepositoryError::database)?,
        );
        let size_bytes: i64 = row
            .try_get("size_bytes")
            .map_err(AssetRepositoryError::database)?;
        let modified_at: Option<String> = row
            .try_get("modified_at")
            .map_err(AssetRepositoryError::database)?;
        let indexed_at: String = row
            .try_get("indexed_at")
            .map_err(AssetRepositoryError::database)?;
        let last_seen_at: Option<String> = row
            .try_get("last_seen_at")
            .map_err(AssetRepositoryError::database)?;
        let is_present: i64 = row
            .try_get("is_present")
            .map_err(AssetRepositoryError::database)?;
        let missing_since: Option<String> = row
            .try_get("missing_since")
            .map_err(AssetRepositoryError::database)?;
        let name = normalized_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .ok_or_else(|| AssetRepositoryError::data("asset path has no file name"))?;
        let directory = normalized_path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| AssetRepositoryError::data("asset path has no parent directory"))?;

        Ok(Self {
            id: Uuid::parse_str(&id).map_err(AssetRepositoryError::data)?,
            environment_id: Uuid::parse_str(&environment_id).map_err(AssetRepositoryError::data)?,
            root_kind: AssetRootKind::parse(&root_kind).ok_or_else(|| {
                AssetRepositoryError::data(format!("unknown asset root kind: {root_kind}"))
            })?,
            kind: AssetKind::parse(&kind)
                .ok_or_else(|| AssetRepositoryError::data(format!("unknown asset kind: {kind}")))?,
            name,
            directory,
            normalized_path,
            size_bytes: u64::try_from(size_bytes).map_err(AssetRepositoryError::data)?,
            modified_at: parse_optional_timestamp(modified_at)?,
            fingerprint: row
                .try_get("fingerprint")
                .map_err(AssetRepositoryError::database)?,
            indexed_at: parse_timestamp(indexed_at)?,
            last_seen_at: parse_optional_timestamp(last_seen_at)?,
            availability: AssetAvailability::from_database_value(is_present).ok_or_else(|| {
                AssetRepositoryError::data(format!(
                    "unknown asset availability value: {is_present}"
                ))
            })?,
            missing_since: parse_optional_timestamp(missing_since)?,
        })
    }
}

fn directory_patterns(directory: &Path) -> Result<(String, String), AssetRepositoryError> {
    let path = directory.to_string_lossy();
    let trimmed = path.trim().trim_end_matches(['\\', '/']);
    if trimmed.is_empty() {
        return Err(AssetRepositoryError::data(
            "asset query directory cannot be empty",
        ));
    }

    let escaped = escape_like_pattern(trimmed);
    Ok((format!("{escaped}\\%"), format!("{escaped}/%")))
}

fn search_pattern(search: &str) -> Result<String, AssetRepositoryError> {
    let trimmed = search.trim();
    if trimmed.is_empty() {
        return Err(AssetRepositoryError::data(
            "asset query search cannot be empty",
        ));
    }

    Ok(format!("%{}%", escape_like_pattern(trimmed)))
}

fn escape_like_pattern(value: &str) -> String {
    value
        .replace('!', "!!")
        .replace('%', "!%")
        .replace('_', "!_")
}

fn parse_timestamp(value: String) -> Result<DateTime<Utc>, AssetRepositoryError> {
    DateTime::parse_from_rfc3339(&value)
        .map(|time| time.with_timezone(&Utc))
        .map_err(AssetRepositoryError::data)
}

fn parse_optional_timestamp(
    value: Option<String>,
) -> Result<Option<DateTime<Utc>>, AssetRepositoryError> {
    value.map(parse_timestamp).transpose()
}

fn size_for_database(size_bytes: u64) -> Result<i64, AssetRepositoryError> {
    i64::try_from(size_bytes).map_err(|_| {
        AssetRepositoryError::data(format!(
            "asset size exceeds SQLite integer range: {size_bytes}"
        ))
    })
}

fn timestamp_for_database(timestamp: Option<DateTime<Utc>>) -> Option<String> {
    timestamp.map(|value| value.to_rfc3339())
}

impl AssetRepositoryError {
    fn database(error: impl fmt::Display) -> Self {
        Self {
            message: format!("资产数据库操作失败：{error}"),
        }
    }

    fn data(error: impl fmt::Display) -> Self {
        Self {
            message: format!("资产索引数据无效：{error}"),
        }
    }
}

impl fmt::Display for AssetRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for AssetRepositoryError {}
