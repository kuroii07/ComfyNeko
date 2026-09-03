use std::time::Duration;

use tauri::State;

use crate::{
    commands::EnvironmentCommandService,
    domain::environment::EnvironmentProfile,
    services::environment_probe::{probe_environment_runtime, ProbeResult},
};

const PYTHON_PROBE_TIMEOUT: Duration = Duration::from_secs(8);
const API_PROBE_TIMEOUT: Duration = Duration::from_secs(2);

#[tauri::command]
pub async fn probe_environment(profile: EnvironmentProfile) -> Result<ProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        probe_environment_runtime(&profile, PYTHON_PROBE_TIMEOUT, API_PROBE_TIMEOUT)
    })
    .await
    .map_err(|error| format!("环境探测任务失败：{error}"))
}

#[tauri::command]
pub async fn save_environment(
    profile: EnvironmentProfile,
    commands: State<'_, EnvironmentCommandService>,
) -> Result<ProbeResult, String> {
    let probe = probe_environment(profile.clone()).await?;
    commands
        .save_environment(&profile, &probe.diagnostics)
        .await
        .map_err(|error| error.to_string())?;

    Ok(probe)
}

#[tauri::command]
pub async fn list_environments(
    commands: State<'_, EnvironmentCommandService>,
) -> Result<Vec<EnvironmentProfile>, String> {
    commands
        .list_environments()
        .await
        .map_err(|error| error.to_string())
}
