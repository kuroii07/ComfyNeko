use std::{path::PathBuf, time::Duration};

use tauri::State;

use crate::{
    commands::{
        AssetDetailCommandService, AssetQueryCommandService, AssetQueryRequest,
        AssetScanCommandService, AssetThumbnailCommandService, CommandErrorPayload,
        EnvironmentCommandService,
    },
    domain::{
        asset::AssetPage,
        asset_detail::AssetDetail,
        asset_scan::{AssetScanIssue, AssetScanTaskSnapshot},
        asset_thumbnail::AssetThumbnail,
        environment::EnvironmentProfile,
    },
    services::{
        environment_discovery::{
            discover_environment_paths as discover_paths, EnvironmentPathDiscovery,
        },
        environment_probe::{probe_environment_runtime, ProbeResult},
        path_action::open_path_in_explorer as open_in_explorer,
    },
};

const PYTHON_PROBE_TIMEOUT: Duration = Duration::from_secs(8);
const API_PROBE_TIMEOUT: Duration = Duration::from_secs(2);

#[tauri::command]
pub async fn open_path_in_explorer(path: PathBuf) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_in_explorer(&path))
        .await
        .map_err(|error| format!("打开路径任务失败：{error}"))?
}

#[tauri::command]
pub async fn discover_environment_paths(
    comfy_root: PathBuf,
) -> Result<EnvironmentPathDiscovery, String> {
    tauri::async_runtime::spawn_blocking(move || discover_paths(&comfy_root))
        .await
        .map_err(|error| format!("环境路径识别任务失败：{error}"))
}

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

#[tauri::command]
pub async fn start_asset_scan(
    environment_id: String,
    commands: State<'_, AssetScanCommandService>,
) -> Result<AssetScanTaskSnapshot, CommandErrorPayload> {
    commands.start(parse_uuid(&environment_id)?).await
}

#[tauri::command]
pub async fn get_asset_scan_task(
    task_id: String,
    commands: State<'_, AssetScanCommandService>,
) -> Result<AssetScanTaskSnapshot, CommandErrorPayload> {
    commands.get(parse_uuid(&task_id)?).await
}

#[tauri::command]
pub async fn list_asset_scan_tasks(
    environment_id: Option<String>,
    commands: State<'_, AssetScanCommandService>,
) -> Result<Vec<AssetScanTaskSnapshot>, CommandErrorPayload> {
    let environment_id = environment_id.as_deref().map(parse_uuid).transpose()?;
    commands.list(environment_id).await
}

#[tauri::command]
pub async fn list_asset_scan_issues(
    task_id: String,
    commands: State<'_, AssetScanCommandService>,
) -> Result<Vec<AssetScanIssue>, CommandErrorPayload> {
    commands.issues(parse_uuid(&task_id)?).await
}

#[tauri::command]
pub async fn cancel_asset_scan(
    task_id: String,
    commands: State<'_, AssetScanCommandService>,
) -> Result<AssetScanTaskSnapshot, CommandErrorPayload> {
    commands.cancel(parse_uuid(&task_id)?).await
}

#[tauri::command]
pub async fn resume_asset_scan(
    task_id: String,
    commands: State<'_, AssetScanCommandService>,
) -> Result<AssetScanTaskSnapshot, CommandErrorPayload> {
    commands.resume(parse_uuid(&task_id)?).await
}

#[tauri::command]
pub async fn query_assets(
    request: AssetQueryRequest,
    commands: State<'_, AssetQueryCommandService>,
) -> Result<AssetPage, CommandErrorPayload> {
    commands.query(request).await
}

#[tauri::command]
pub async fn get_asset_thumbnail(
    asset_id: String,
    commands: State<'_, AssetThumbnailCommandService>,
) -> Result<AssetThumbnail, CommandErrorPayload> {
    commands.get(parse_uuid(&asset_id)?).await
}

#[tauri::command]
pub async fn get_asset_detail(
    asset_id: String,
    commands: State<'_, AssetDetailCommandService>,
) -> Result<AssetDetail, CommandErrorPayload> {
    commands.get(parse_uuid(&asset_id)?).await
}

fn parse_uuid(value: &str) -> Result<uuid::Uuid, CommandErrorPayload> {
    uuid::Uuid::parse_str(value).map_err(|_| CommandErrorPayload {
        code: "INVALID_ID".to_owned(),
        message: format!("无效的标识符：{value}"),
        retryable: false,
    })
}
