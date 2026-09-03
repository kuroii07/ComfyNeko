use std::{error::Error, fmt, time::Duration};

use crate::{
    domain::{diagnostic::Diagnostic, environment::EnvironmentProfile},
    repositories::environment_repository::{EnvironmentRepository, SaveEnvironmentError},
    services::environment_probe::{probe_environment_runtime, ProbeResult},
};

#[derive(Clone)]
pub struct EnvironmentCommandService {
    repository: EnvironmentRepository,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnvironmentCommandError {
    BlockingDiagnostics,
    Repository(String),
}

impl EnvironmentCommandService {
    pub fn new(repository: EnvironmentRepository) -> Self {
        Self { repository }
    }

    pub async fn save_environment(
        &self,
        profile: &EnvironmentProfile,
        diagnostics: &[Diagnostic],
    ) -> Result<(), EnvironmentCommandError> {
        self.repository
            .save_if_valid(profile, diagnostics)
            .await
            .map_err(EnvironmentCommandError::from)
    }

    pub async fn list_environments(
        &self,
    ) -> Result<Vec<EnvironmentProfile>, EnvironmentCommandError> {
        self.repository
            .list()
            .await
            .map_err(|error| EnvironmentCommandError::Repository(error.to_string()))
    }

    pub async fn probe_and_save_environment(
        &self,
        profile: &EnvironmentProfile,
        python_timeout: Duration,
        api_timeout: Duration,
    ) -> Result<ProbeResult, EnvironmentCommandError> {
        let probe = probe_environment_runtime(profile, python_timeout, api_timeout);
        self.save_environment(profile, &probe.diagnostics).await?;

        Ok(probe)
    }
}

impl From<SaveEnvironmentError> for EnvironmentCommandError {
    fn from(error: SaveEnvironmentError) -> Self {
        match error {
            SaveEnvironmentError::BlockingDiagnostics => Self::BlockingDiagnostics,
            SaveEnvironmentError::Repository(error) => Self::Repository(error.to_string()),
        }
    }
}

impl fmt::Display for EnvironmentCommandError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BlockingDiagnostics => formatter.write_str("存在阻塞诊断，不能保存环境档案"),
            Self::Repository(message) => formatter.write_str(message),
        }
    }
}

impl Error for EnvironmentCommandError {}
