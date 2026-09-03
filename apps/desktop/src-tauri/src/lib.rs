pub mod commands;
pub mod domain;
pub mod repositories;
pub mod services;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("运行 ComfyNeko 桌面应用失败");
}
