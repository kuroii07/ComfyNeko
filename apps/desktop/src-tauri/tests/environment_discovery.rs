use std::fs;
use std::path::PathBuf;

use comfyneko_core::services::environment_discovery::discover_environment_paths;
use tempfile::TempDir;

#[test]
fn discovers_standard_comfyui_folders_and_a_sibling_standalone_python() {
    let fixture = TempDir::new().unwrap();
    let install_root = fixture.path().join("ComfyUI_Portable");
    let comfy_root = install_root.join("ComfyUI");
    let python = install_root.join("standalone-env").join("python.exe");

    fs::create_dir_all(comfy_root.join("models")).unwrap();
    fs::create_dir_all(comfy_root.join("input")).unwrap();
    fs::create_dir_all(comfy_root.join("output")).unwrap();
    fs::create_dir_all(comfy_root.join("custom_nodes")).unwrap();
    fs::create_dir_all(comfy_root.join("user").join("default").join("workflows")).unwrap();
    fs::create_dir_all(python.parent().unwrap()).unwrap();
    fs::write(&python, []).unwrap();
    fs::write(comfy_root.join("main.py"), []).unwrap();

    let result = discover_environment_paths(&comfy_root);

    assert_eq!(result.python_executable.as_deref(), Some(python.as_path()));
    assert_eq!(result.roots.models, vec![comfy_root.join("models")]);
    assert_eq!(result.roots.input, vec![comfy_root.join("input")]);
    assert_eq!(result.roots.output, vec![comfy_root.join("output")]);
    assert_eq!(
        result.roots.workflows,
        vec![comfy_root.join("user").join("default").join("workflows")]
    );
    assert_eq!(
        result.roots.custom_nodes,
        vec![comfy_root.join("custom_nodes")]
    );
}

#[test]
fn only_returns_paths_that_exist_and_does_not_create_missing_folders() {
    let fixture = TempDir::new().unwrap();
    let comfy_root = fixture.path().join("ComfyUI");
    fs::create_dir_all(&comfy_root).unwrap();
    fs::write(comfy_root.join("main.py"), []).unwrap();

    let result = discover_environment_paths(&comfy_root);

    assert_eq!(result.python_executable, None);
    assert!(result.roots.models.is_empty());
    assert!(result.roots.input.is_empty());
    assert!(result.roots.output.is_empty());
    assert!(result.roots.workflows.is_empty());
    assert!(result.roots.custom_nodes.is_empty());
    assert!(!comfy_root.join("models").exists());
}

#[test]
#[ignore = "requires COMFYNEKO_SMOKE_ROOT and COMFYNEKO_SMOKE_PYTHON"]
fn discovers_the_configured_live_environment_without_writing_to_it() {
    let comfy_root = required_path("COMFYNEKO_SMOKE_ROOT");
    let python = required_path("COMFYNEKO_SMOKE_PYTHON");

    let result = discover_environment_paths(&comfy_root);

    assert_eq!(result.python_executable, Some(python));
    assert_eq!(result.roots.models, vec![comfy_root.join("models")]);
    assert_eq!(result.roots.input, vec![comfy_root.join("input")]);
    assert_eq!(result.roots.output, vec![comfy_root.join("output")]);
    assert_eq!(
        result.roots.workflows,
        vec![comfy_root.join("user").join("default").join("workflows")]
    );
    assert_eq!(
        result.roots.custom_nodes,
        vec![comfy_root.join("custom_nodes")]
    );
}

fn required_path(name: &str) -> PathBuf {
    std::env::var_os(name)
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("{name} must be set for the ignored smoke test"))
}
