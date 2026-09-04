use std::{error::Error, fmt, path::Path, time::Duration};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    SqlitePool,
};

use super::migrations::{self, MigrationError};

const FILE_DATABASE_MAX_CONNECTIONS: u32 = 4;
const DATABASE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub struct AppDatabase {
    pool: SqlitePool,
}

#[derive(Debug)]
pub enum AppDatabaseError {
    Connect(sqlx::Error),
    Migration(MigrationError),
}

impl AppDatabase {
    pub async fn connect_file(path: impl AsRef<Path>) -> Result<Self, AppDatabaseError> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .busy_timeout(DATABASE_BUSY_TIMEOUT);
        let pool = SqlitePoolOptions::new()
            .max_connections(FILE_DATABASE_MAX_CONNECTIONS)
            .connect_with(options)
            .await
            .map_err(AppDatabaseError::Connect)?;

        Self::from_pool(pool).await
    }

    pub async fn connect_in_memory() -> Result<Self, AppDatabaseError> {
        let options = SqliteConnectOptions::new()
            .filename(":memory:")
            .create_if_missing(true)
            .foreign_keys(true)
            .busy_timeout(DATABASE_BUSY_TIMEOUT);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .map_err(AppDatabaseError::Connect)?;

        Self::from_pool(pool).await
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    async fn from_pool(pool: SqlitePool) -> Result<Self, AppDatabaseError> {
        migrations::run(&pool)
            .await
            .map_err(AppDatabaseError::Migration)?;

        Ok(Self { pool })
    }
}

impl fmt::Display for AppDatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(error) => write!(formatter, "连接应用数据库失败：{error}"),
            Self::Migration(error) => write!(formatter, "升级应用数据库失败：{error}"),
        }
    }
}

impl Error for AppDatabaseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Connect(error) => Some(error),
            Self::Migration(error) => Some(error),
        }
    }
}
