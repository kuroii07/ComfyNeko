use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::domain::environment::EnvironmentRoots;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct EnvironmentPathDiscovery {
    pub python_executable: Option<PathBuf>,
    pub roots: EnvironmentRoots,
}

pub fn discover_environment_paths(comfy_root: &Path) -> EnvironmentPathDiscovery {
    if !comfy_root.is_dir() {
        return EnvironmentPathDiscovery::default();
    }

    let mut roots = EnvironmentRoots::default();
    push_existing_directory(&mut roots.models, comfy_root.join("models"));
    push_existing_directory(&mut roots.input, comfy_root.join("input"));
    push_existing_directory(&mut roots.output, comfy_root.join("output"));
    push_existing_directory(&mut roots.custom_nodes, comfy_root.join("custom_nodes"));

    let user_workflows = comfy_root.join("user").join("default").join("workflows");
    if user_workflows.is_dir() {
        roots.workflows.push(user_workflows);
    } else {
        push_existing_directory(&mut roots.workflows, comfy_root.join("workflows"));
    }

    EnvironmentPathDiscovery {
        python_executable: python_candidates(comfy_root)
            .into_iter()
            .find(|candidate| candidate.is_file()),
        roots,
    }
}

fn python_candidates(comfy_root: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![
        comfy_root.join(".venv").join("Scripts").join("python.exe"),
        comfy_root.join("venv").join("Scripts").join("python.exe"),
        comfy_root.join("python_embeded").join("python.exe"),
    ];

    if let Some(install_root) = comfy_root.parent() {
        candidates.push(install_root.join("standalone-env").join("python.exe"));
        candidates.push(install_root.join("python_embeded").join("python.exe"));
    }

    candidates
}

fn push_existing_directory(target: &mut Vec<PathBuf>, candidate: PathBuf) {
    if candidate.is_dir() {
        target.push(candidate);
    }
}
