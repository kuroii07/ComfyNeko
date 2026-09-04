use std::{
    error::Error,
    fmt,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::domain::{
    diagnostic::{Diagnostic, Severity},
    environment::{ApiBinding, EnvironmentProfile, EnvironmentRoots},
};

use super::{database::AppDatabase, migrations};

#[derive(Clone)]
pub struct EnvironmentRepository {
    pool: SqlitePool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SaveEnvironmentError {
    BlockingDiagnostics,
    Repository(RepositoryError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryError {
    message: String,
}

impl EnvironmentRepository {
    pub async fn connect_in_memory() -> Result<Self, RepositoryError> {
        let database = AppDatabase::connect_in_memory()
            .await
            .map_err(RepositoryError::database)?;

        Ok(Self {
            pool: database.pool().clone(),
        })
    }

    pub async fn connect_file(database_path: impl AsRef<Path>) -> Result<Self, RepositoryError> {
        let database = AppDatabase::connect_file(database_path)
            .await
            .map_err(RepositoryError::database)?;

        Ok(Self {
            pool: database.pool().clone(),
        })
    }

    pub async fn from_pool(pool: SqlitePool) -> Result<Self, RepositoryError> {
        migrations::run(&pool)
            .await
            .map_err(RepositoryError::database)?;

        Ok(Self { pool })
    }

    pub async fn save_if_valid(
        &self,
        profile: &EnvironmentProfile,
        diagnostics: &[Diagnostic],
    ) -> Result<(), SaveEnvironmentError> {
        if diagnostics
            .iter()
            .any(|diagnostic| diagnostic.severity == Severity::Blocking)
        {
            return Err(SaveEnvironmentError::BlockingDiagnostics);
        }

        let roots_json = serde_json::to_string(&profile.roots).map_err(|error| {
            SaveEnvironmentError::Repository(RepositoryError::serialization(error))
        })?;
        let (api_host, api_port) = profile
            .api
            .as_ref()
            .map(|api| (Some(api.host.as_str()), Some(i64::from(api.port))))
            .unwrap_or((None, None));

        sqlx::query(
            r#"
            INSERT INTO environment_profiles (
                id, name, comfy_root, python_executable, api_host, api_port, roots_json, last_validated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                comfy_root = excluded.comfy_root,
                python_executable = excluded.python_executable,
                api_host = excluded.api_host,
                api_port = excluded.api_port,
                roots_json = excluded.roots_json,
                last_validated_at = excluded.last_validated_at
            "#,
        )
        .bind(profile.id.to_string())
        .bind(&profile.name)
        .bind(profile.comfy_root.to_string_lossy().to_string())
        .bind(
            profile
                .python_executable
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
        )
        .bind(api_host)
        .bind(api_port)
        .bind(roots_json)
        .bind(profile.last_validated_at.map(|timestamp| timestamp.to_rfc3339()))
        .execute(&self.pool)
        .await
        .map_err(|error| SaveEnvironmentError::Repository(RepositoryError::database(error)))?;

        Ok(())
    }

    pub async fn list(&self) -> Result<Vec<EnvironmentProfile>, RepositoryError> {
        let rows = sqlx::query(
            r#"
            SELECT id, name, comfy_root, python_executable, api_host, api_port, roots_json, last_validated_at
            FROM environment_profiles
            ORDER BY name COLLATE NOCASE ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(RepositoryError::database)?;

        rows.into_iter().map(EnvironmentProfile::try_from).collect()
    }

    pub async fn get(&self, id: Uuid) -> Result<Option<EnvironmentProfile>, RepositoryError> {
        sqlx::query(
            r#"
            SELECT id, name, comfy_root, python_executable, api_host, api_port, roots_json, last_validated_at
            FROM environment_profiles
            WHERE id = ?
            "#,
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(RepositoryError::database)?
        .map(EnvironmentProfile::try_from)
        .transpose()
    }
}

impl TryFrom<sqlx::sqlite::SqliteRow> for EnvironmentProfile {
    type Error = RepositoryError;

    fn try_from(row: sqlx::sqlite::SqliteRow) -> Result<Self, Self::Error> {
        let id: String = row.try_get("id").map_err(RepositoryError::database)?;
        let api_host: Option<String> =
            row.try_get("api_host").map_err(RepositoryError::database)?;
        let api_port: Option<i64> = row.try_get("api_port").map_err(RepositoryError::database)?;
        let roots_json: String = row
            .try_get("roots_json")
            .map_err(RepositoryError::database)?;
        let validated: Option<String> = row
            .try_get("last_validated_at")
            .map_err(RepositoryError::database)?;

        Ok(Self {
            id: Uuid::parse_str(&id).map_err(RepositoryError::data)?,
            name: row.try_get("name").map_err(RepositoryError::database)?,
            comfy_root: PathBuf::from(
                row.try_get::<String, _>("comfy_root")
                    .map_err(RepositoryError::database)?,
            ),
            python_executable: row
                .try_get::<Option<String>, _>("python_executable")
                .map_err(RepositoryError::database)?
                .map(PathBuf::from),
            api: decode_api_binding(api_host, api_port)?,
            roots: serde_json::from_str::<EnvironmentRoots>(&roots_json)
                .map_err(RepositoryError::serialization)?,
            last_validated_at: validated
                .map(|value| {
                    DateTime::parse_from_rfc3339(&value).map(|time| time.with_timezone(&Utc))
                })
                .transpose()
                .map_err(RepositoryError::data)?,
        })
    }
}

fn decode_api_binding(
    host: Option<String>,
    port: Option<i64>,
) -> Result<Option<ApiBinding>, RepositoryError> {
    match (host, port) {
        (None, None) => Ok(None),
        (Some(host), Some(port)) => Ok(Some(ApiBinding {
            host,
            port: u16::try_from(port).map_err(RepositoryError::data)?,
        })),
        _ => Err(RepositoryError::data(
            "API host and port must be stored together",
        )),
    }
}

impl RepositoryError {
    fn database(error: impl fmt::Display) -> Self {
        Self {
            message: format!("数据库操作失败：{error}"),
        }
    }

    fn serialization(error: impl fmt::Display) -> Self {
        Self {
            message: format!("环境档案序列化失败：{error}"),
        }
    }

    fn data(error: impl fmt::Display) -> Self {
        Self {
            message: format!("环境档案数据无效：{error}"),
        }
    }
}

impl fmt::Display for RepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for RepositoryError {}

impl fmt::Display for SaveEnvironmentError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BlockingDiagnostics => formatter.write_str("存在阻塞诊断，不能保存环境档案"),
            Self::Repository(error) => error.fmt(formatter),
        }
    }
}

impl Error for SaveEnvironmentError {}
