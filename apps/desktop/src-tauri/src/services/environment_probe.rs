use std::{fs, path::PathBuf};

use crate::{
    domain::{
        diagnostic::{Diagnostic, Severity},
        environment::EnvironmentProfile,
    },
    services::path_guard::validate_allowed_root,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeResult {
    pub normalized_comfy_root: Option<PathBuf>,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn probe_environment(candidate: &EnvironmentProfile) -> ProbeResult {
    let mut diagnostics = Vec::new();
    let normalized_comfy_root = validate_comfy_root(candidate, &mut diagnostics);
    validate_python(candidate, &mut diagnostics);
    validate_asset_roots(candidate, &mut diagnostics);

    ProbeResult {
        normalized_comfy_root,
        diagnostics,
    }
}

fn validate_comfy_root(
    candidate: &EnvironmentProfile,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<PathBuf> {
    if !candidate.comfy_root.exists() {
        diagnostics.push(blocking(
            "COMFY_ROOT_NOT_FOUND",
            format!("未找到 ComfyUI 根目录：{}", candidate.comfy_root.display()),
        ));
        return None;
    }

    if !candidate.comfy_root.is_dir() {
        diagnostics.push(blocking(
            "COMFY_ROOT_NOT_DIRECTORY",
            format!(
                "ComfyUI 根路径必须是目录：{}",
                candidate.comfy_root.display()
            ),
        ));
        return None;
    }

    let normalized = match validate_allowed_root(&candidate.comfy_root) {
        Ok(path) => path,
        Err(_) => {
            diagnostics.push(blocking(
                "COMFY_ROOT_UNREADABLE",
                format!(
                    "无法读取 ComfyUI 根目录：{}",
                    candidate.comfy_root.display()
                ),
            ));
            return None;
        }
    };

    if !normalized.join("main.py").is_file() {
        diagnostics.push(blocking(
            "COMFY_ROOT_NOT_RECOGNIZED",
            format!(
                "目录中未找到 ComfyUI 主程序 main.py：{}",
                normalized.display()
            ),
        ));
        return None;
    }

    Some(normalized)
}

fn validate_python(candidate: &EnvironmentProfile, diagnostics: &mut Vec<Diagnostic>) {
    match &candidate.python_executable {
        None => diagnostics.push(blocking("PYTHON_NOT_CONFIGURED", "尚未选择 Python 解释器")),
        Some(path) if !path.is_file() => diagnostics.push(blocking(
            "PYTHON_NOT_FOUND",
            format!("未找到 Python 解释器：{}", path.display()),
        )),
        Some(_) => {}
    }
}

fn validate_asset_roots(candidate: &EnvironmentProfile, diagnostics: &mut Vec<Diagnostic>) {
    for root in candidate
        .roots
        .models
        .iter()
        .chain(&candidate.roots.input)
        .chain(&candidate.roots.output)
        .chain(&candidate.roots.workflows)
        .chain(&candidate.roots.custom_nodes)
    {
        if !root.exists() {
            diagnostics.push(warning(
                "ASSET_ROOT_NOT_FOUND",
                format!("资产目录不存在，未创建：{}", root.display()),
            ));
            continue;
        }

        if !root.is_dir() {
            diagnostics.push(blocking(
                "ASSET_ROOT_NOT_DIRECTORY",
                format!("资产路径必须是目录：{}", root.display()),
            ));
            continue;
        }

        let normalized = match validate_allowed_root(root) {
            Ok(path) => path,
            Err(_) => {
                diagnostics.push(blocking(
                    "ASSET_ROOT_UNREADABLE",
                    format!("无法读取资产目录：{}", root.display()),
                ));
                continue;
            }
        };

        if fs::read_dir(&normalized).is_err() {
            diagnostics.push(blocking(
                "ASSET_ROOT_UNREADABLE",
                format!("无法列出资产目录：{}", normalized.display()),
            ));
        }
    }
}

fn blocking(code: &str, message: impl Into<String>) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        message: message.into(),
        severity: Severity::Blocking,
        evidence: None,
    }
}

fn warning(code: &str, message: impl Into<String>) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        message: message.into(),
        severity: Severity::Warning,
        evidence: None,
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use tempfile::TempDir;

    use crate::domain::environment::EnvironmentProfile;

    use super::probe_environment;

    fn valid_profile(fixture: &TempDir) -> EnvironmentProfile {
        let comfy_root = fixture.path().join("ComfyUI");
        fs::create_dir(&comfy_root).unwrap();
        fs::write(comfy_root.join("main.py"), "# ComfyUI entry point").unwrap();

        let python = fixture.path().join("python.exe");
        fs::write(&python, []).unwrap();

        let mut profile = EnvironmentProfile::new("测试环境", comfy_root);
        profile.python_executable = Some(python);
        profile
    }

    #[test]
    fn probe_accepts_a_root_with_a_comfyui_entry_point() {
        let fixture = TempDir::new().unwrap();
        let result = probe_environment(&valid_profile(&fixture));

        assert!(
            result
                .diagnostics
                .iter()
                .all(|diagnostic| diagnostic.severity
                    != crate::domain::diagnostic::Severity::Blocking)
        );
    }

    #[test]
    fn probe_marks_missing_python_as_blocking() {
        let fixture = TempDir::new().unwrap();
        let mut profile = valid_profile(&fixture);
        profile.python_executable = Some(PathBuf::from(r"C:\\missing\\python.exe"));

        let result = probe_environment(&profile);

        assert!(result.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == "PYTHON_NOT_FOUND"
                && diagnostic.severity == crate::domain::diagnostic::Severity::Blocking
        }));
    }

    #[test]
    fn probe_marks_a_directory_without_main_py_as_blocking() {
        let fixture = TempDir::new().unwrap();
        let not_comfy_root = fixture.path().join("not-comfyui");
        fs::create_dir(&not_comfy_root).unwrap();

        let profile = EnvironmentProfile::new("错误目录", not_comfy_root);
        let result = probe_environment(&profile);

        assert!(result.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == "COMFY_ROOT_NOT_RECOGNIZED"
                && diagnostic.severity == crate::domain::diagnostic::Severity::Blocking
        }));
    }

    #[test]
    fn probe_marks_a_file_as_an_invalid_comfyui_root() {
        let fixture = TempDir::new().unwrap();
        let root_file = fixture.path().join("not-a-directory.txt");
        fs::write(&root_file, "not a directory").unwrap();

        let profile = EnvironmentProfile::new("错误根目录", root_file);
        let result = probe_environment(&profile);

        assert!(result.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == "COMFY_ROOT_NOT_DIRECTORY"
                && diagnostic.severity == crate::domain::diagnostic::Severity::Blocking
        }));
    }

    #[test]
    fn probe_warns_without_creating_a_missing_asset_root() {
        let fixture = TempDir::new().unwrap();
        let mut profile = valid_profile(&fixture);
        let missing_input = fixture.path().join("input-does-not-exist");
        profile.roots.input.push(missing_input.clone());

        let result = probe_environment(&profile);

        assert!(!missing_input.exists());
        assert!(result.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == "ASSET_ROOT_NOT_FOUND"
                && diagnostic.severity == crate::domain::diagnostic::Severity::Warning
        }));
    }

    #[test]
    fn probe_marks_a_file_as_an_invalid_asset_root() {
        let fixture = TempDir::new().unwrap();
        let mut profile = valid_profile(&fixture);
        let root_file = fixture.path().join("not-an-asset-directory.txt");
        fs::write(&root_file, "not a directory").unwrap();
        profile.roots.models.push(root_file);

        let result = probe_environment(&profile);

        assert!(result.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == "ASSET_ROOT_NOT_DIRECTORY"
                && diagnostic.severity == crate::domain::diagnostic::Severity::Blocking
        }));
    }
}
