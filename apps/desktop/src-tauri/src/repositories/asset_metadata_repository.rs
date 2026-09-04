use std::{error::Error, fmt};

use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use uuid::Uuid;

use crate::{
    domain::asset_detail::{AssetMetadataState, CachedAssetPngMetadata},
    repositories::migrations,
};

#[derive(Clone)]
pub struct AssetMetadataRepository {
    pool: SqlitePool,
}

#[derive(Debug)]
pub struct AssetMetadataRepositoryError {
    message: String,
}

impl AssetMetadataRepository {
    pub async fn from_pool(pool: SqlitePool) -> Result<Self, AssetMetadataRepositoryError> {
        migrations::run(&pool)
            .await
            .map_err(AssetMetadataRepositoryError::database)?;

        Ok(Self { pool })
    }

    pub async fn get_png_metadata(
        &self,
        asset_id: Uuid,
    ) -> Result<Option<CachedAssetPngMetadata>, AssetMetadataRepositoryError> {
        sqlx::query(
            r#"
            SELECT asset_id, parser_version, source_size_bytes, source_modified_at,
                   parse_state, prompt_text, workflow_text, parsed_at
            FROM asset_png_metadata
            WHERE asset_id = ?
            "#,
        )
        .bind(asset_id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(AssetMetadataRepositoryError::database)?
        .map(CachedAssetPngMetadata::try_from)
        .transpose()
    }

    pub async fn upsert_png_metadata(
        &self,
        record: &CachedAssetPngMetadata,
    ) -> Result<(), AssetMetadataRepositoryError> {
        sqlx::query(
            r#"
            INSERT INTO asset_png_metadata (
                asset_id, parser_version, source_size_bytes, source_modified_at,
                parse_state, prompt_text, workflow_text, parsed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(asset_id) DO UPDATE SET
                parser_version = excluded.parser_version,
                source_size_bytes = excluded.source_size_bytes,
                source_modified_at = excluded.source_modified_at,
                parse_state = excluded.parse_state,
                prompt_text = excluded.prompt_text,
                workflow_text = excluded.workflow_text,
                parsed_at = excluded.parsed_at
            "#,
        )
        .bind(record.asset_id.to_string())
        .bind(&record.parser_version)
        .bind(size_for_database(record.source_size_bytes)?)
        .bind(record.source_modified_at.to_rfc3339())
        .bind(record.state.as_str())
        .bind(&record.prompt_text)
        .bind(&record.workflow_text)
        .bind(record.parsed_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .map_err(AssetMetadataRepositoryError::database)?;

        Ok(())
    }
}

impl TryFrom<SqliteRow> for CachedAssetPngMetadata {
    type Error = AssetMetadataRepositoryError;

    fn try_from(row: SqliteRow) -> Result<Self, Self::Error> {
        let source_size_bytes: i64 = row
            .try_get("source_size_bytes")
            .map_err(AssetMetadataRepositoryError::database)?;
        let state: String = row
            .try_get("parse_state")
            .map_err(AssetMetadataRepositoryError::database)?;

        Ok(Self {
            asset_id: parse_uuid(
                row.try_get("asset_id")
                    .map_err(AssetMetadataRepositoryError::database)?,
            )?,
            parser_version: row
                .try_get("parser_version")
                .map_err(AssetMetadataRepositoryError::database)?,
            source_size_bytes: u64::try_from(source_size_bytes)
                .map_err(AssetMetadataRepositoryError::data)?,
            source_modified_at: parse_timestamp(
                row.try_get("source_modified_at")
                    .map_err(AssetMetadataRepositoryError::database)?,
            )?,
            state: AssetMetadataState::parse(&state).ok_or_else(|| {
                AssetMetadataRepositoryError::data(format!("unknown metadata state: {state}"))
            })?,
            prompt_text: row
                .try_get("prompt_text")
                .map_err(AssetMetadataRepositoryError::database)?,
            workflow_text: row
                .try_get("workflow_text")
                .map_err(AssetMetadataRepositoryError::database)?,
            parsed_at: parse_timestamp(
                row.try_get("parsed_at")
                    .map_err(AssetMetadataRepositoryError::database)?,
            )?,
        })
    }
}

impl AssetMetadataRepositoryError {
    fn database(error: impl ToString) -> Self {
        Self {
            message: error.to_string(),
        }
    }

    fn data(error: impl ToString) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

impl fmt::Display for AssetMetadataRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for AssetMetadataRepositoryError {}

fn size_for_database(size: u64) -> Result<i64, AssetMetadataRepositoryError> {
    i64::try_from(size).map_err(AssetMetadataRepositoryError::data)
}

fn parse_uuid(value: String) -> Result<Uuid, AssetMetadataRepositoryError> {
    Uuid::parse_str(&value).map_err(AssetMetadataRepositoryError::data)
}

fn parse_timestamp(value: String) -> Result<DateTime<Utc>, AssetMetadataRepositoryError> {
    DateTime::parse_from_rfc3339(&value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .map_err(AssetMetadataRepositoryError::data)
}
