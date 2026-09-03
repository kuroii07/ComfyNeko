pub mod commands;
pub mod domain;
pub mod repositories;
pub mod services;

use std::fs;

use commands::{tauri_commands, EnvironmentCommandService};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_local_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let commands = tauri::async_runtime::block_on(
                EnvironmentCommandService::connect_file(app_data_dir.join("comfyneko.db")),
            )?;
            app.manage(commands);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tauri_commands::probe_environment,
            tauri_commands::save_environment,
            tauri_commands::list_environments
        ])
        .run(tauri::generate_context!())
        .expect("运行 ComfyNeko 桌面应用失败");
}
