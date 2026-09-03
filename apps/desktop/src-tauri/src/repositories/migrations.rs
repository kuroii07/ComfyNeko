use sqlx::SqlitePool;

const ENVIRONMENT_MIGRATION: &str = include_str!("../../migrations/0001_environments.sql");
const ASSET_MIGRATION: &str = include_str!("../../migrations/0002_assets.sql");

pub async fn run(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::raw_sql(ENVIRONMENT_MIGRATION).execute(pool).await?;
    sqlx::raw_sql(ASSET_MIGRATION).execute(pool).await?;

    Ok(())
}
