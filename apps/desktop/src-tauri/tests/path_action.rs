use std::fs;

use comfyneko_core::services::path_action::{classify_explorer_target, ExplorerTargetKind};
use tempfile::tempdir;

#[test]
fn classifies_directories_for_opening_and_files_for_revealing() {
    let fixture = tempdir().expect("create temporary directory");
    let directory = fixture.path().join("models");
    let file = fixture.path().join("python.exe");
    fs::create_dir(&directory).expect("create directory");
    fs::write(&file, b"fixture").expect("create file");

    assert_eq!(
        classify_explorer_target(&directory).expect("classify directory"),
        ExplorerTargetKind::Directory
    );
    assert_eq!(
        classify_explorer_target(&file).expect("classify file"),
        ExplorerTargetKind::File
    );
}

#[test]
fn rejects_a_missing_path_before_requesting_explorer() {
    let fixture = tempdir().expect("create temporary directory");
    let missing = fixture.path().join("missing");

    let error = classify_explorer_target(&missing).expect_err("reject missing path");

    assert!(error.contains("路径不存在"));
}
