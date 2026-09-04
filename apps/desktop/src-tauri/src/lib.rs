pub mod commands;
pub mod domain;
pub mod repositories;
pub mod services;

use std::{fs, io};

use commands::{
    tauri_commands, AssetDetailCommandService, AssetPreviewCommandService,
    AssetQueryCommandService, AssetScanCommandService, AssetThumbnailCommandService,
    EnvironmentCommandService,
};
use repositories::{
    asset_metadata_repository::AssetMetadataRepository, asset_repository::AssetRepository,
    database::AppDatabase, environment_repository::EnvironmentRepository,
};
use services::{
    asset_detail_service::AssetDetailService, asset_preview_service::AssetPreviewService,
    asset_scan_service::AssetScanService, asset_thumbnail_service::AssetThumbnailService,
};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_local_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let thumbnail_cache_root = app_data_dir.join("cache").join("thumbnails");
            fs::create_dir_all(&thumbnail_cache_root)?;
            let preview_cache_root = app_data_dir.join("cache").join("previews");
            fs::create_dir_all(&preview_cache_root)?;
            let (
                environment_commands,
                asset_scan_commands,
                asset_query_commands,
                asset_thumbnail_commands,
                asset_detail_commands,
                asset_preview_commands,
            ) = tauri::async_runtime::block_on(async {
                let database = AppDatabase::connect_file(app_data_dir.join("comfyneko.db"))
                    .await
                    .map_err(|error| error.to_string())?;
                let environment_repository =
                    EnvironmentRepository::from_pool(database.pool().clone())
                        .await
                        .map_err(|error| error.to_string())?;
                let environment_commands =
                    EnvironmentCommandService::new(environment_repository.clone());
                let asset_repository = AssetRepository::from_pool(database.pool().clone())
                    .await
                    .map_err(|error| error.to_string())?;
                let asset_query_commands = AssetQueryCommandService::new(asset_repository.clone());
                let asset_metadata_repository =
                    AssetMetadataRepository::from_pool(database.pool().clone())
                        .await
                        .map_err(|error| error.to_string())?;
                let asset_detail_commands =
                    AssetDetailCommandService::new(AssetDetailService::new(
                        asset_repository.clone(),
                        environment_repository.clone(),
                        asset_metadata_repository,
                    ));
                let asset_thumbnail_commands =
                    AssetThumbnailCommandService::new(AssetThumbnailService::new(
                        asset_repository.clone(),
                        environment_repository.clone(),
                        thumbnail_cache_root,
                    ));
                let asset_preview_commands =
                    AssetPreviewCommandService::new(AssetPreviewService::new(
                        asset_repository.clone(),
                        environment_repository.clone(),
                        preview_cache_root,
                    ));
                let scan_service = AssetScanService::from_database(database)
                    .await
                    .map_err(|error| error.to_string())?;
                let asset_scan_commands = AssetScanCommandService::new(scan_service);
                asset_scan_commands
                    .recover_interrupted()
                    .await
                    .map_err(|error| error.message)?;

                Ok::<_, String>((
                    environment_commands,
                    asset_scan_commands,
                    asset_query_commands,
                    asset_thumbnail_commands,
                    asset_detail_commands,
                    asset_preview_commands,
                ))
            })
            .map_err(io::Error::other)?;
            app.manage(environment_commands);
            app.manage(asset_scan_commands);
            app.manage(asset_query_commands);
            app.manage(asset_thumbnail_commands);
            app.manage(asset_detail_commands);
            app.manage(asset_preview_commands);

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
            tauri_commands::resume_asset_scan,
            tauri_commands::query_assets,
            tauri_commands::get_asset_thumbnail,
            tauri_commands::get_asset_detail,
            tauri_commands::get_asset_preview
        ])
        .run(tauri::generate_context!())
        .expect("运行 ComfyNeko 桌面应用失败");
}
