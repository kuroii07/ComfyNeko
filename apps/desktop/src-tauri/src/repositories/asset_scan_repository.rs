use std::{error::Error, fmt, path::PathBuf};

use chrono::{DateTime, Utc};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use uuid::Uuid;

use crate::{
    domain::{
        asset::{AssetRootKind, AssetScanRoot, AssetUpsertOutcome},
        asset_scan::{
            AssetScanErrorSnapshot, AssetScanIssue, AssetScanStatus, AssetScanTaskSnapshot,
            ClaimedScanDirectory,
        },
    },
    services::asset_discovery::DirectoryDiscovery,
};

use super::{
    asset_repository::{upsert_in_transaction, AssetScanWitness},
    migrations,
};

const ACTIVE_STATUSES: &str = "'queued', 'running', 'cancelling', 'paused', 'interrupted'";

#[derive(Clone)]
pub struct AssetScanRepository {
    pool: SqlitePool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AssetScanRepositoryError {
    ActiveTaskExists {
        environment_id: Uuid,
    },
    TaskNotFound {
        task_id: Uuid,
    },
    InvalidTransition {
        task_id: Uuid,
        from: AssetScanStatus,
        to: AssetScanStatus,
    },
    EmptyRoots,
    Database(String),
    Serialization(String),
    Data(String),
}

impl AssetScanRepository {
    pub async fn from_pool(pool: SqlitePool) -> Result<Self, AssetScanRepositoryError> {
        migrations::run(&pool)
            .await
            .map_err(AssetScanRepositoryError::database)?;

        Ok(Self { pool })
    }

    pub async fn create_task(
        &self,
        environment_id: Uuid,
        roots: &[AssetScanRoot],
    ) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
        let roots = sorted_unique_roots(roots);
        if roots.is_empty() {
            return Err(AssetScanRepositoryError::EmptyRoots);
        }

        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetScanRepositoryError::database)?;
        let existing_id = sqlx::query_scalar::<_, String>(&format!(
            r#"
            SELECT id
            FROM asset_scan_tasks
            WHERE environment_id = ? AND status IN ({ACTIVE_STATUSES})
            LIMIT 1
            "#
        ))
        .bind(environment_id.to_string())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        if existing_id.is_some() {
            return Err(AssetScanRepositoryError::ActiveTaskExists { environment_id });
        }

        let task_id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();
        let roots_json =
            serde_json::to_string(&roots).map_err(AssetScanRepositoryError::serialization)?;
        sqlx::query(
            r#"
            INSERT INTO asset_scan_tasks (
                id, environment_id, status, roots_json, created_at, updated_at
            ) VALUES (?, ?, 'queued', ?, ?, ?)
            "#,
        )
        .bind(task_id.to_string())
        .bind(environment_id.to_string())
        .bind(roots_json)
        .bind(&now)
        .bind(&now)
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            if is_active_task_constraint(&error) {
                AssetScanRepositoryError::ActiveTaskExists { environment_id }
            } else {
                AssetScanRepositoryError::database(error)
            }
        })?;

        for root in &roots {
            let path = root.path.to_string_lossy().to_string();
            sqlx::query(
                r#"
                INSERT INTO asset_scan_directories (
                    task_id, root_kind, root_path, directory_path, state, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
                "#,
            )
            .bind(task_id.to_string())
            .bind(root.kind.as_str())
            .bind(&path)
            .bind(&path)
            .bind(&now)
            .bind(&now)
            .execute(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?;
        }

        transaction
            .commit()
            .await
            .map_err(AssetScanRepositoryError::database)?;

        self.get_task(task_id)
            .await?
            .ok_or(AssetScanRepositoryError::TaskNotFound { task_id })
    }

    pub async fn get_task(
        &self,
        task_id: Uuid,
    ) -> Result<Option<AssetScanTaskSnapshot>, AssetScanRepositoryError> {
        fetch_task(&self.pool, "WHERE task.id = ?", Some(task_id.to_string())).await
    }

    pub async fn find_active_for_environment(
        &self,
        environment_id: Uuid,
    ) -> Result<Option<AssetScanTaskSnapshot>, AssetScanRepositoryError> {
        fetch_task(
            &self.pool,
            &format!(
                "WHERE task.environment_id = ? AND task.status IN ({ACTIVE_STATUSES}) ORDER BY task.updated_at DESC LIMIT 1"
            ),
            Some(environment_id.to_string()),
        )
        .await
    }

    pub async fn list_tasks(
        &self,
        environment_id: Uuid,
    ) -> Result<Vec<AssetScanTaskSnapshot>, AssetScanRepositoryError> {
        fetch_tasks(
            &self.pool,
            "WHERE task.environment_id = ? ORDER BY task.created_at DESC",
            Some(environment_id.to_string()),
        )
        .await
    }

    pub async fn list_all_tasks(
        &self,
    ) -> Result<Vec<AssetScanTaskSnapshot>, AssetScanRepositoryError> {
        fetch_tasks(&self.pool, "ORDER BY task.created_at DESC", None).await
    }

    pub async fn request_cancel(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
        let status = self.required_status(task_id).await?;
        if matches!(status, AssetScanStatus::Queued | AssetScanStatus::Running) {
            let now = Utc::now().to_rfc3339();
            sqlx::query(
                r#"
                UPDATE asset_scan_tasks
                SET status = 'cancelling', cancel_requested_at = ?, updated_at = ?
                WHERE id = ?
                "#,
            )
            .bind(&now)
            .bind(&now)
            .bind(task_id.to_string())
            .execute(&self.pool)
            .await
            .map_err(AssetScanRepositoryError::database)?;
        }

        self.required_task(task_id).await
    }

    pub async fn mark_paused(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetScanRepositoryError::database)?;
        let status = status_in_transaction(&mut transaction, task_id).await?;
        if status != AssetScanStatus::Cancelling && status != AssetScanStatus::Paused {
            return Err(AssetScanRepositoryError::InvalidTransition {
                task_id,
                from: status,
                to: AssetScanStatus::Paused,
            });
        }

        if status == AssetScanStatus::Cancelling {
            let now = Utc::now().to_rfc3339();
            sqlx::query(
                r#"
                UPDATE asset_scan_directories
                SET state = 'pending', updated_at = ?
                WHERE task_id = ? AND state = 'processing'
                "#,
            )
            .bind(&now)
            .bind(task_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?;
            sqlx::query(
                r#"
                UPDATE asset_scan_tasks
                SET status = 'paused', current_path = NULL, updated_at = ?
                WHERE id = ?
                "#,
            )
            .bind(&now)
            .bind(task_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?;
        }

        transaction
            .commit()
            .await
            .map_err(AssetScanRepositoryError::database)?;
        self.required_task(task_id).await
    }

    pub async fn resume_task(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
        let status = self.required_status(task_id).await?;
        if !status.can_resume() {
            return Err(AssetScanRepositoryError::InvalidTransition {
                task_id,
                from: status,
                to: AssetScanStatus::Queued,
            });
        }

        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            UPDATE asset_scan_tasks
            SET status = 'queued',
                cancel_requested_at = NULL,
                current_path = NULL,
                error_code = NULL,
                error_message = NULL,
                finished_at = NULL,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(now)
        .bind(task_id.to_string())
        .execute(&self.pool)
        .await
        .map_err(AssetScanRepositoryError::database)?;

        self.required_task(task_id).await
    }

    pub async fn recover_interrupted_tasks(&self) -> Result<u64, AssetScanRepositoryError> {
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetScanRepositoryError::database)?;
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            UPDATE asset_scan_directories
            SET state = 'pending', updated_at = ?
            WHERE state = 'processing'
              AND task_id IN (
                  SELECT id
                  FROM asset_scan_tasks
                  WHERE status IN ('queued', 'running', 'cancelling')
              )
            "#,
        )
        .bind(&now)
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        let recovered = sqlx::query(
            r#"
            UPDATE asset_scan_tasks
            SET status = 'interrupted',
                cancel_requested_at = NULL,
                current_path = NULL,
                updated_at = ?
            WHERE status IN ('queued', 'running', 'cancelling')
            "#,
        )
        .bind(&now)
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?
        .rows_affected();
        transaction
            .commit()
            .await
            .map_err(AssetScanRepositoryError::database)?;

        Ok(recovered)
    }

    pub async fn mark_failed(
        &self,
        task_id: Uuid,
        code: &str,
        message: &str,
    ) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetScanRepositoryError::database)?;
        status_in_transaction(&mut transaction, task_id).await?;
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            UPDATE asset_scan_directories
            SET state = 'pending', updated_at = ?
            WHERE task_id = ? AND state = 'processing'
            "#,
        )
        .bind(&now)
        .bind(task_id.to_string())
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        sqlx::query(
            r#"
            UPDATE asset_scan_tasks
            SET status = 'failed',
                current_path = NULL,
                error_code = ?,
                error_message = ?,
                updated_at = ?,
                finished_at = ?
            WHERE id = ?
            "#,
        )
        .bind(code)
        .bind(message)
        .bind(&now)
        .bind(&now)
        .bind(task_id.to_string())
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        transaction
            .commit()
            .await
            .map_err(AssetScanRepositoryError::database)?;

        self.required_task(task_id).await
    }

    pub async fn claim_next_directory(
        &self,
        task_id: Uuid,
    ) -> Result<Option<ClaimedScanDirectory>, AssetScanRepositoryError> {
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetScanRepositoryError::database)?;
        let status = status_in_transaction(&mut transaction, task_id).await?;
        if !matches!(status, AssetScanStatus::Queued | AssetScanStatus::Running) {
            transaction
                .commit()
                .await
                .map_err(AssetScanRepositoryError::database)?;
            return Ok(None);
        }

        let row = sqlx::query(
            r#"
            SELECT task_id, root_kind, root_path, directory_path
            FROM asset_scan_directories
            WHERE task_id = ? AND state = 'pending'
            ORDER BY root_kind, directory_path
            LIMIT 1
            "#,
        )
        .bind(task_id.to_string())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        let Some(row) = row else {
            transaction
                .commit()
                .await
                .map_err(AssetScanRepositoryError::database)?;
            return Ok(None);
        };
        let directory = claimed_directory_from_row(row)?;
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            UPDATE asset_scan_directories
            SET state = 'processing', updated_at = ?
            WHERE task_id = ? AND root_kind = ? AND directory_path = ? AND state = 'pending'
            "#,
        )
        .bind(&now)
        .bind(task_id.to_string())
        .bind(directory.root_kind.as_str())
        .bind(directory.directory_path.to_string_lossy().to_string())
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        sqlx::query(
            r#"
            UPDATE asset_scan_tasks
            SET status = 'running',
                started_at = COALESCE(started_at, ?),
                current_path = ?,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&now)
        .bind(directory.directory_path.to_string_lossy().to_string())
        .bind(&now)
        .bind(task_id.to_string())
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        transaction
            .commit()
            .await
            .map_err(AssetScanRepositoryError::database)?;

        Ok(Some(directory))
    }

    pub async fn commit_directory(
        &self,
        task_id: Uuid,
        claimed: &ClaimedScanDirectory,
        discovery: &DirectoryDiscovery,
    ) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
        if claimed.task_id != task_id {
            return Err(AssetScanRepositoryError::data(
                "claimed directory belongs to a different scan task",
            ));
        }

        if let Err(error) = self
            .commit_directory_transaction(task_id, claimed, discovery)
            .await
        {
            if let Err(reset_error) = self.reset_claimed_directory(claimed).await {
                return Err(AssetScanRepositoryError::database(format!(
                    "{error}; failed to restore claimed directory: {reset_error}"
                )));
            }

            return Err(error);
        }

        self.required_task(task_id).await
    }

    pub async fn finalize_if_complete(
        &self,
        task_id: Uuid,
        current_roots: &[AssetScanRoot],
    ) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetScanRepositoryError::database)?;
        let row = sqlx::query(
            r#"
            SELECT environment_id, status, roots_json, cancel_requested_at, issue_count
            FROM asset_scan_tasks
            WHERE id = ?
            "#,
        )
        .bind(task_id.to_string())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?
        .ok_or(AssetScanRepositoryError::TaskNotFound { task_id })?;
        let environment_id = parse_uuid(row.try_get("environment_id")?)?;
        let status_text: String = row.try_get("status")?;
        let status = AssetScanStatus::parse(&status_text).ok_or_else(|| {
            AssetScanRepositoryError::data(format!("unknown asset scan status: {status_text}"))
        })?;
        let roots_json: String = row.try_get("roots_json")?;
        let cancel_requested_at: Option<String> = row.try_get("cancel_requested_at")?;
        let issue_count: i64 = row.try_get("issue_count")?;
        let unfinished_directories: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM asset_scan_directories
            WHERE task_id = ? AND state != 'done'
            "#,
        )
        .bind(task_id.to_string())
        .fetch_one(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;

        if !matches!(status, AssetScanStatus::Queued | AssetScanStatus::Running)
            || cancel_requested_at.is_some()
            || unfinished_directories > 0
        {
            transaction
                .commit()
                .await
                .map_err(AssetScanRepositoryError::database)?;
            return self.required_task(task_id).await;
        }

        let stored_roots: Vec<AssetScanRoot> =
            serde_json::from_str(&roots_json).map_err(AssetScanRepositoryError::serialization)?;
        let current_roots = sorted_unique_roots(current_roots);
        let roots_changed = stored_roots != current_roots;
        let now = Utc::now().to_rfc3339();
        let mut effective_issue_count = nonnegative(issue_count)?;
        if roots_changed {
            let issue_exists: i64 = sqlx::query_scalar(
                r#"
                SELECT COUNT(*)
                FROM asset_scan_issues
                WHERE task_id = ? AND code = 'SCAN_ROOTS_CHANGED'
                "#,
            )
            .bind(task_id.to_string())
            .fetch_one(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?;
            if issue_exists == 0 {
                let issue_path = current_roots
                    .first()
                    .map(|root| root.path.to_string_lossy().to_string())
                    .or_else(|| {
                        stored_roots
                            .first()
                            .map(|root| root.path.to_string_lossy().to_string())
                    })
                    .unwrap_or_default();
                sqlx::query(
                    r#"
                    INSERT INTO asset_scan_issues (
                        task_id, path, code, message, created_at
                    ) VALUES (?, ?, 'SCAN_ROOTS_CHANGED', ?, ?)
                    "#,
                )
                .bind(task_id.to_string())
                .bind(issue_path)
                .bind("扫描期间环境资产目录配置发生变化，未执行失效标记")
                .bind(&now)
                .execute(&mut *transaction)
                .await
                .map_err(AssetScanRepositoryError::database)?;
                effective_issue_count += 1;
            }
        }

        if effective_issue_count > 0 {
            sqlx::query(
                r#"
                UPDATE asset_scan_tasks
                SET status = 'completed_with_issues',
                    issue_count = ?,
                    current_path = NULL,
                    updated_at = ?,
                    finished_at = ?
                WHERE id = ?
                "#,
            )
            .bind(i64::try_from(effective_issue_count).map_err(AssetScanRepositoryError::data)?)
            .bind(&now)
            .bind(&now)
            .bind(task_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?;
        } else {
            let invalidated_count = sqlx::query(
                r#"
                UPDATE assets
                SET is_present = 0,
                    missing_since = COALESCE(missing_since, ?)
                WHERE environment_id = ?
                  AND is_present != 0
                  AND (last_seen_scan_id IS NULL OR last_seen_scan_id != ?)
                "#,
            )
            .bind(&now)
            .bind(environment_id.to_string())
            .bind(task_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?
            .rows_affected();
            sqlx::query(
                r#"
                UPDATE asset_scan_tasks
                SET status = 'completed',
                    invalidated_count = ?,
                    current_path = NULL,
                    updated_at = ?,
                    finished_at = ?
                WHERE id = ?
                "#,
            )
            .bind(i64::try_from(invalidated_count).map_err(AssetScanRepositoryError::data)?)
            .bind(&now)
            .bind(&now)
            .bind(task_id.to_string())
            .execute(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?;
        }

        transaction
            .commit()
            .await
            .map_err(AssetScanRepositoryError::database)?;
        self.required_task(task_id).await
    }

    pub async fn list_issues(
        &self,
        task_id: Uuid,
    ) -> Result<Vec<AssetScanIssue>, AssetScanRepositoryError> {
        let rows = sqlx::query(
            r#"
            SELECT id, task_id, path, code, message, created_at
            FROM asset_scan_issues
            WHERE task_id = ?
            ORDER BY id
            "#,
        )
        .bind(task_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(AssetScanRepositoryError::database)?;

        rows.into_iter().map(issue_from_row).collect()
    }

    async fn commit_directory_transaction(
        &self,
        task_id: Uuid,
        claimed: &ClaimedScanDirectory,
        discovery: &DirectoryDiscovery,
    ) -> Result<(), AssetScanRepositoryError> {
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetScanRepositoryError::database)?;
        let row = sqlx::query("SELECT environment_id, status FROM asset_scan_tasks WHERE id = ?")
            .bind(task_id.to_string())
            .fetch_optional(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?
            .ok_or(AssetScanRepositoryError::TaskNotFound { task_id })?;
        let environment_id = parse_uuid(row.try_get("environment_id")?)?;
        let status_text: String = row.try_get("status")?;
        let status = AssetScanStatus::parse(&status_text).ok_or_else(|| {
            AssetScanRepositoryError::data(format!("unknown asset scan status: {status_text}"))
        })?;
        if status != AssetScanStatus::Running {
            return Err(AssetScanRepositoryError::data(format!(
                "cannot commit a directory while task status is {}",
                status.as_str()
            )));
        }

        let directory_state = sqlx::query_scalar::<_, String>(
            r#"
            SELECT state
            FROM asset_scan_directories
            WHERE task_id = ? AND root_kind = ? AND directory_path = ? AND root_path = ?
            "#,
        )
        .bind(task_id.to_string())
        .bind(claimed.root_kind.as_str())
        .bind(claimed.directory_path.to_string_lossy().to_string())
        .bind(claimed.root_path.to_string_lossy().to_string())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?
        .ok_or_else(|| AssetScanRepositoryError::data("claimed directory is not persisted"))?;
        if directory_state != "processing" {
            return Err(AssetScanRepositoryError::data(format!(
                "claimed directory is not processing: {directory_state}"
            )));
        }

        let seen_at = Utc::now();
        let witness = AssetScanWitness { task_id, seen_at };
        let mut inserted_count = 0_u64;
        let mut updated_count = 0_u64;
        let mut unchanged_count = 0_u64;
        for observation in &discovery.observations {
            validate_observation(environment_id, claimed, observation)?;
            match upsert_in_transaction(&mut transaction, observation, Some(&witness))
                .await
                .map_err(AssetScanRepositoryError::data)?
            {
                AssetUpsertOutcome::Inserted(_) => inserted_count += 1,
                AssetUpsertOutcome::Updated(_) => updated_count += 1,
                AssetUpsertOutcome::Unchanged(_) => unchanged_count += 1,
            }
        }

        let now = seen_at.to_rfc3339();
        for child in &discovery.child_directories {
            validate_child_directory(claimed, child)?;
            sqlx::query(
                r#"
                INSERT INTO asset_scan_directories (
                    task_id, root_kind, root_path, directory_path, state, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
                ON CONFLICT(task_id, root_kind, directory_path) DO NOTHING
                "#,
            )
            .bind(task_id.to_string())
            .bind(claimed.root_kind.as_str())
            .bind(claimed.root_path.to_string_lossy().to_string())
            .bind(child.to_string_lossy().to_string())
            .bind(&now)
            .bind(&now)
            .execute(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?;
        }
        for issue in &discovery.issues {
            sqlx::query(
                r#"
                INSERT INTO asset_scan_issues (
                    task_id, path, code, message, created_at
                ) VALUES (?, ?, ?, ?, ?)
                "#,
            )
            .bind(task_id.to_string())
            .bind(issue.path.to_string_lossy().to_string())
            .bind(&issue.code)
            .bind(&issue.message)
            .bind(&now)
            .execute(&mut *transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?;
        }

        let completed = sqlx::query(
            r#"
            UPDATE asset_scan_directories
            SET state = 'done', updated_at = ?
            WHERE task_id = ? AND root_kind = ? AND directory_path = ? AND state = 'processing'
            "#,
        )
        .bind(&now)
        .bind(task_id.to_string())
        .bind(claimed.root_kind.as_str())
        .bind(claimed.directory_path.to_string_lossy().to_string())
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?
        .rows_affected();
        if completed != 1 {
            return Err(AssetScanRepositoryError::data(
                "claimed directory checkpoint was lost before commit",
            ));
        }

        sqlx::query(
            r#"
            UPDATE asset_scan_tasks
            SET processed_directories = processed_directories + 1,
                discovered_assets = discovered_assets + ?,
                inserted_count = inserted_count + ?,
                updated_count = updated_count + ?,
                unchanged_count = unchanged_count + ?,
                issue_count = issue_count + ?,
                current_path = NULL,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(count_for_database(discovery.observations.len())?)
        .bind(i64::try_from(inserted_count).map_err(AssetScanRepositoryError::data)?)
        .bind(i64::try_from(updated_count).map_err(AssetScanRepositoryError::data)?)
        .bind(i64::try_from(unchanged_count).map_err(AssetScanRepositoryError::data)?)
        .bind(count_for_database(discovery.issues.len())?)
        .bind(&now)
        .bind(task_id.to_string())
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;

        transaction
            .commit()
            .await
            .map_err(AssetScanRepositoryError::database)
    }

    async fn reset_claimed_directory(
        &self,
        claimed: &ClaimedScanDirectory,
    ) -> Result<(), AssetScanRepositoryError> {
        let mut transaction = self
            .pool
            .begin_with("BEGIN IMMEDIATE")
            .await
            .map_err(AssetScanRepositoryError::database)?;
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            UPDATE asset_scan_directories
            SET state = 'pending', updated_at = ?
            WHERE task_id = ? AND root_kind = ? AND directory_path = ? AND state = 'processing'
            "#,
        )
        .bind(&now)
        .bind(claimed.task_id.to_string())
        .bind(claimed.root_kind.as_str())
        .bind(claimed.directory_path.to_string_lossy().to_string())
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        sqlx::query(
            r#"
            UPDATE asset_scan_tasks
            SET current_path = NULL, updated_at = ?
            WHERE id = ? AND current_path = ?
            "#,
        )
        .bind(&now)
        .bind(claimed.task_id.to_string())
        .bind(claimed.directory_path.to_string_lossy().to_string())
        .execute(&mut *transaction)
        .await
        .map_err(AssetScanRepositoryError::database)?;
        transaction
            .commit()
            .await
            .map_err(AssetScanRepositoryError::database)
    }

    async fn required_status(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanStatus, AssetScanRepositoryError> {
        let status =
            sqlx::query_scalar::<_, String>("SELECT status FROM asset_scan_tasks WHERE id = ?")
                .bind(task_id.to_string())
                .fetch_optional(&self.pool)
                .await
                .map_err(AssetScanRepositoryError::database)?
                .ok_or(AssetScanRepositoryError::TaskNotFound { task_id })?;

        AssetScanStatus::parse(&status).ok_or_else(|| {
            AssetScanRepositoryError::data(format!("unknown asset scan status: {status}"))
        })
    }

    async fn required_task(
        &self,
        task_id: Uuid,
    ) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
        self.get_task(task_id)
            .await?
            .ok_or(AssetScanRepositoryError::TaskNotFound { task_id })
    }
}

async fn status_in_transaction(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    task_id: Uuid,
) -> Result<AssetScanStatus, AssetScanRepositoryError> {
    let status =
        sqlx::query_scalar::<_, String>("SELECT status FROM asset_scan_tasks WHERE id = ?")
            .bind(task_id.to_string())
            .fetch_optional(&mut **transaction)
            .await
            .map_err(AssetScanRepositoryError::database)?
            .ok_or(AssetScanRepositoryError::TaskNotFound { task_id })?;

    AssetScanStatus::parse(&status).ok_or_else(|| {
        AssetScanRepositoryError::data(format!("unknown asset scan status: {status}"))
    })
}

fn validate_observation(
    environment_id: Uuid,
    claimed: &ClaimedScanDirectory,
    observation: &crate::domain::asset::AssetObservation,
) -> Result<(), AssetScanRepositoryError> {
    if observation.environment_id != environment_id {
        return Err(AssetScanRepositoryError::data(
            "directory observation belongs to a different environment",
        ));
    }
    if observation.root_kind != claimed.root_kind {
        return Err(AssetScanRepositoryError::data(
            "directory observation has a different root kind",
        ));
    }
    if !observation.normalized_path.starts_with(&claimed.root_path)
        || observation.normalized_path.parent() != Some(claimed.directory_path.as_path())
    {
        return Err(AssetScanRepositoryError::data(
            "directory observation is outside the claimed directory",
        ));
    }

    Ok(())
}

fn validate_child_directory(
    claimed: &ClaimedScanDirectory,
    child: &std::path::Path,
) -> Result<(), AssetScanRepositoryError> {
    if !child.starts_with(&claimed.root_path)
        || child.parent() != Some(claimed.directory_path.as_path())
    {
        return Err(AssetScanRepositoryError::data(
            "child directory is outside the claimed directory",
        ));
    }

    Ok(())
}

fn count_for_database(count: usize) -> Result<i64, AssetScanRepositoryError> {
    i64::try_from(count).map_err(AssetScanRepositoryError::data)
}

async fn fetch_task(
    pool: &SqlitePool,
    clause: &str,
    argument: Option<String>,
) -> Result<Option<AssetScanTaskSnapshot>, AssetScanRepositoryError> {
    let rows = fetch_task_rows(pool, clause, argument).await?;
    rows.into_iter().next().map(task_from_row).transpose()
}

async fn fetch_tasks(
    pool: &SqlitePool,
    clause: &str,
    argument: Option<String>,
) -> Result<Vec<AssetScanTaskSnapshot>, AssetScanRepositoryError> {
    fetch_task_rows(pool, clause, argument)
        .await?
        .into_iter()
        .map(task_from_row)
        .collect()
}

async fn fetch_task_rows(
    pool: &SqlitePool,
    clause: &str,
    argument: Option<String>,
) -> Result<Vec<SqliteRow>, AssetScanRepositoryError> {
    let query = format!(
        r#"
        SELECT
            task.id,
            task.environment_id,
            task.status,
            task.processed_directories,
            (
                SELECT COUNT(*)
                FROM asset_scan_directories AS directory
                WHERE directory.task_id = task.id AND directory.state = 'pending'
            ) AS pending_directories,
            task.discovered_assets,
            task.inserted_count,
            task.updated_count,
            task.unchanged_count,
            task.invalidated_count,
            task.issue_count,
            task.current_path,
            task.error_code,
            task.error_message,
            task.created_at,
            task.started_at,
            task.updated_at,
            task.finished_at
        FROM asset_scan_tasks AS task
        {clause}
        "#
    );
    let query = sqlx::query(&query);
    let rows = if let Some(argument) = argument {
        query.bind(argument).fetch_all(pool).await
    } else {
        query.fetch_all(pool).await
    }
    .map_err(AssetScanRepositoryError::database)?;

    Ok(rows)
}

fn task_from_row(row: SqliteRow) -> Result<AssetScanTaskSnapshot, AssetScanRepositoryError> {
    let id = parse_uuid(row.try_get("id")?)?;
    let environment_id = parse_uuid(row.try_get("environment_id")?)?;
    let status_text: String = row.try_get("status")?;
    let status = AssetScanStatus::parse(&status_text).ok_or_else(|| {
        AssetScanRepositoryError::data(format!("unknown asset scan status: {status_text}"))
    })?;
    let error_code: Option<String> = row.try_get("error_code")?;
    let error_message: Option<String> = row.try_get("error_message")?;
    let error = match (error_code, error_message) {
        (None, None) => None,
        (Some(code), Some(message)) => Some(AssetScanErrorSnapshot {
            code,
            message,
            retryable: false,
        }),
        _ => {
            return Err(AssetScanRepositoryError::data(
                "asset scan error code and message must be stored together",
            ))
        }
    };

    Ok(AssetScanTaskSnapshot {
        id,
        environment_id,
        status,
        processed_directories: nonnegative(row.try_get("processed_directories")?)?,
        pending_directories: nonnegative(row.try_get("pending_directories")?)?,
        discovered_assets: nonnegative(row.try_get("discovered_assets")?)?,
        inserted_count: nonnegative(row.try_get("inserted_count")?)?,
        updated_count: nonnegative(row.try_get("updated_count")?)?,
        unchanged_count: nonnegative(row.try_get("unchanged_count")?)?,
        invalidated_count: nonnegative(row.try_get("invalidated_count")?)?,
        issue_count: nonnegative(row.try_get("issue_count")?)?,
        current_path: row
            .try_get::<Option<String>, _>("current_path")?
            .map(PathBuf::from),
        can_cancel: status.can_cancel(),
        can_resume: status.can_resume(),
        created_at: parse_required_time(row.try_get("created_at")?)?,
        started_at: parse_optional_time(row.try_get("started_at")?)?,
        updated_at: parse_required_time(row.try_get("updated_at")?)?,
        finished_at: parse_optional_time(row.try_get("finished_at")?)?,
        error,
    })
}

fn claimed_directory_from_row(
    row: SqliteRow,
) -> Result<ClaimedScanDirectory, AssetScanRepositoryError> {
    let root_kind: String = row.try_get("root_kind")?;

    Ok(ClaimedScanDirectory {
        task_id: parse_uuid(row.try_get("task_id")?)?,
        root_kind: AssetRootKind::parse(&root_kind).ok_or_else(|| {
            AssetScanRepositoryError::data(format!("unknown asset root kind: {root_kind}"))
        })?,
        root_path: PathBuf::from(row.try_get::<String, _>("root_path")?),
        directory_path: PathBuf::from(row.try_get::<String, _>("directory_path")?),
    })
}

fn issue_from_row(row: SqliteRow) -> Result<AssetScanIssue, AssetScanRepositoryError> {
    Ok(AssetScanIssue {
        id: row.try_get("id")?,
        task_id: parse_uuid(row.try_get("task_id")?)?,
        path: PathBuf::from(row.try_get::<String, _>("path")?),
        code: row.try_get("code")?,
        message: row.try_get("message")?,
        created_at: parse_required_time(row.try_get("created_at")?)?,
    })
}

fn sorted_unique_roots(roots: &[AssetScanRoot]) -> Vec<AssetScanRoot> {
    let mut roots = roots.to_vec();
    roots.sort_by(|left, right| {
        left.kind.as_str().cmp(right.kind.as_str()).then_with(|| {
            left.path
                .to_string_lossy()
                .cmp(&right.path.to_string_lossy())
        })
    });
    roots.dedup_by(|left, right| left.kind == right.kind && left.path == right.path);
    roots
}

fn parse_uuid(value: String) -> Result<Uuid, AssetScanRepositoryError> {
    Uuid::parse_str(&value).map_err(AssetScanRepositoryError::data)
}

fn parse_required_time(value: String) -> Result<DateTime<Utc>, AssetScanRepositoryError> {
    DateTime::parse_from_rfc3339(&value)
        .map(|time| time.with_timezone(&Utc))
        .map_err(AssetScanRepositoryError::data)
}

fn parse_optional_time(
    value: Option<String>,
) -> Result<Option<DateTime<Utc>>, AssetScanRepositoryError> {
    value.map(parse_required_time).transpose()
}

fn nonnegative(value: i64) -> Result<u64, AssetScanRepositoryError> {
    u64::try_from(value).map_err(AssetScanRepositoryError::data)
}

fn is_active_task_constraint(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|database_error| database_error.constraint())
        .is_some_and(|constraint| constraint == "idx_asset_scan_tasks_one_active_per_environment")
}

impl AssetScanRepositoryError {
    fn database(error: impl fmt::Display) -> Self {
        Self::Database(format!("扫描任务数据库操作失败：{error}"))
    }

    fn serialization(error: impl fmt::Display) -> Self {
        Self::Serialization(format!("扫描任务序列化失败：{error}"))
    }

    fn data(error: impl fmt::Display) -> Self {
        Self::Data(format!("扫描任务数据无效：{error}"))
    }
}

impl fmt::Display for AssetScanRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ActiveTaskExists { environment_id } => {
                write!(formatter, "环境 {environment_id} 已有未结束的扫描任务")
            }
            Self::TaskNotFound { task_id } => {
                write!(formatter, "未找到扫描任务：{task_id}")
            }
            Self::InvalidTransition { task_id, from, to } => write!(
                formatter,
                "扫描任务 {task_id} 不能从 {} 切换到 {}",
                from.as_str(),
                to.as_str()
            ),
            Self::EmptyRoots => formatter.write_str("扫描任务至少需要一个根目录"),
            Self::Database(message) | Self::Serialization(message) | Self::Data(message) => {
                formatter.write_str(message)
            }
        }
    }
}

impl Error for AssetScanRepositoryError {}

impl From<sqlx::Error> for AssetScanRepositoryError {
    fn from(error: sqlx::Error) -> Self {
        Self::database(error)
    }
}
