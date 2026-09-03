use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use comfyneko_core::{
    domain::{
        diagnostic::Severity,
        environment::{ApiBinding, EnvironmentProfile},
    },
    services::environment_probe::probe_environment_runtime,
};

#[test]
#[ignore = "requires COMFYNEKO_SMOKE_ROOT and COMFYNEKO_SMOKE_PYTHON"]
fn live_environment_scenarios_do_not_modify_the_bound_root() {
    let comfy_root = required_path("COMFYNEKO_SMOKE_ROOT");
    let python = required_path("COMFYNEKO_SMOKE_PYTHON");
    let before = snapshot_tree(&comfy_root);

    let mut valid = EnvironmentProfile::new("真实环境 smoke", comfy_root.clone());
    valid.python_executable = Some(python.clone());
    let valid_result =
        probe_environment_runtime(&valid, Duration::from_secs(8), Duration::from_secs(1));
    assert!(
        valid_result
            .diagnostics
            .iter()
            .all(|diagnostic| diagnostic.severity != Severity::Blocking),
        "valid profile returned blocking diagnostics: {:?}",
        valid_result.diagnostics
    );

    let mut invalid_python = valid.clone();
    invalid_python.python_executable = Some(comfy_root.join("missing-python.exe"));
    let invalid_result = probe_environment_runtime(
        &invalid_python,
        Duration::from_secs(8),
        Duration::from_secs(1),
    );
    assert!(invalid_result
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "PYTHON_NOT_FOUND"));

    let mut offline_api = valid;
    offline_api.api = Some(ApiBinding {
        host: "127.0.0.1".to_owned(),
        port: 9,
    });
    let offline_result = probe_environment_runtime(
        &offline_api,
        Duration::from_secs(8),
        Duration::from_millis(200),
    );
    assert!(offline_result.diagnostics.iter().any(|diagnostic| {
        diagnostic.code == "API_UNREACHABLE" && diagnostic.severity == Severity::Warning
    }));

    let after = snapshot_tree(&comfy_root);
    assert_eq!(before, after, "environment probing changed the bound root");

    println!(
        "valid={:?}; invalid_python={:?}; offline_api={:?}",
        diagnostic_codes(&valid_result),
        diagnostic_codes(&invalid_result),
        diagnostic_codes(&offline_result)
    );
}

fn required_path(name: &str) -> PathBuf {
    std::env::var_os(name)
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("{name} must be set for the ignored smoke test"))
}

fn diagnostic_codes(
    result: &comfyneko_core::services::environment_probe::ProbeResult,
) -> Vec<&str> {
    result
        .diagnostics
        .iter()
        .map(|diagnostic| diagnostic.code.as_str())
        .collect()
}

fn snapshot_tree(root: &Path) -> Vec<(PathBuf, u64, Option<SystemTime>)> {
    let mut pending = vec![root.to_path_buf()];
    let mut entries = Vec::new();

    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .unwrap_or_else(|error| panic!("failed to read {}: {error}", directory.display()))
        {
            let entry = entry.unwrap();
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).unwrap();
            let relative = path.strip_prefix(root).unwrap().to_path_buf();
            entries.push((relative, metadata.len(), metadata.modified().ok()));

            if metadata.is_dir() && !metadata.file_type().is_symlink() {
                pending.push(path);
            }
        }
    }

    entries.sort_by(|left, right| left.0.cmp(&right.0));
    entries
}
