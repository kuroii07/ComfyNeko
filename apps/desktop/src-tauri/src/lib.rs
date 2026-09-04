pub mod commands;
pub mod domain;
pub mod repositories;
pub mod services;

use std::{fs, io};

use commands::{tauri_commands, AssetScanCommandService, EnvironmentCommandService};
use repositories::{database::AppDatabase, environment_repository::EnvironmentRepository};
use services::asset_scan_service::AssetScanService;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_local_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let (environment_commands, asset_scan_commands) =
                tauri::async_runtime::block_on(async {
                    let database = AppDatabase::connect_file(app_data_dir.join("comfyneko.db"))
                        .await
                        .map_err(|error| error.to_string())?;
                    let environment_repository =
                        EnvironmentRepository::from_pool(database.pool().clone())
                            .await
                            .map_err(|error| error.to_string())?;
                    let environment_commands =
                        EnvironmentCommandService::new(environment_repository);
                    let scan_service = AssetScanService::from_database(database)
                        .await
                        .map_err(|error| error.to_string())?;
                    let asset_scan_commands = AssetScanCommandService::new(scan_service);
                    asset_scan_commands
                        .recover_interrupted()
                        .await
                        .map_err(|error| error.message)?;

                    Ok::<_, String>((environment_commands, asset_scan_commands))
                })
                .map_err(io::Error::other)?;
            app.manage(environment_commands);
            app.manage(asset_scan_commands);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tauri_commands::open_path_in_explorer,
            tauri_commands::discover_environment_paths,
            tauri_commands::probe_environment,
            tauri_commands::save_environment,
            tauri_commands::list_environments,
            tauri_commands::start_asset_scan,
            tauri_commands::get_asset_scan_task,
            tauri_commands::list_asset_scan_tasks,
            tauri_commands::list_asset_scan_issues,
            tauri_commands::cancel_asset_scan,
            tauri_commands::resume_asset_scan
        ])
        .run(tauri::generate_context!())
        .expect("运行 ComfyNeko 桌面应用失败");
}
