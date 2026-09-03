use std::{fs, path::Path};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExplorerTargetKind {
    Directory,
    File,
}

pub fn classify_explorer_target(path: &Path) -> Result<ExplorerTargetKind, String> {
    let metadata =
        fs::metadata(path).map_err(|_| format!("路径不存在或不可访问：{}", path.display()))?;

    if metadata.is_dir() {
        Ok(ExplorerTargetKind::Directory)
    } else if metadata.is_file() {
        Ok(ExplorerTargetKind::File)
    } else {
        Err(format!("不支持打开该路径：{}", path.display()))
    }
}

pub fn open_path_in_explorer(path: &Path) -> Result<(), String> {
    match classify_explorer_target(path)? {
        ExplorerTargetKind::Directory => {
            tauri_plugin_opener::open_path(path, None::<&str>).map_err(|error| error.to_string())
        }
        ExplorerTargetKind::File => {
            tauri_plugin_opener::reveal_item_in_dir(path).map_err(|error| error.to_string())
        }
    }
}
