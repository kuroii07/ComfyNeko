use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};

use serde::Serialize;
use wait_timeout::ChildExt;

use crate::domain::diagnostic::{Diagnostic, Severity};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportStatus {
    Available,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PythonProbe {
    pub executable: PathBuf,
    pub version: String,
    pub import_status: ImportStatus,
}

pub fn probe_python(python: &Path, timeout: Duration) -> Result<PythonProbe, Diagnostic> {
    let version = run_bounded_python_command(python, &["--version"], timeout)?;
    let import_result = run_bounded_python_command(
        python,
        &[
            "-c",
            "import importlib.util; print('available' if importlib.util.find_spec('comfy') else 'missing')",
        ],
        timeout,
    )?;

    let import_status = if import_result.trim() == "available" {
        ImportStatus::Available
    } else {
        ImportStatus::Missing
    };

    Ok(PythonProbe {
        executable: python.to_path_buf(),
        version,
        import_status,
    })
}

pub fn map_child_timeout(timeout: Duration) -> Diagnostic {
    Diagnostic {
        code: "PYTHON_TIMEOUT".to_owned(),
        message: format!("Python 探测超过 {} 秒，已终止", timeout.as_secs()),
        severity: Severity::Blocking,
        evidence: None,
    }
}

fn run_bounded_python_command(
    python: &Path,
    arguments: &[&str],
    timeout: Duration,
) -> Result<String, Diagnostic> {
    let mut child = Command::new(python)
        .args(arguments)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| {
            blocking(
                "PYTHON_START_FAILED",
                format!("无法启动 Python：{}", python.display()),
            )
        })?;

    let status = child
        .wait_timeout(timeout)
        .map_err(|_| blocking("PYTHON_WAIT_FAILED", "等待 Python 探测结果失败"))?;

    let Some(status) = status else {
        let _ = child.kill();
        let _ = child.wait();
        return Err(map_child_timeout(timeout));
    };

    let output = child
        .wait_with_output()
        .map_err(|_| blocking("PYTHON_OUTPUT_FAILED", "读取 Python 探测输出失败"))?;

    if !status.success() {
        return Err(blocking(
            "PYTHON_COMMAND_FAILED",
            format!("Python 探测命令执行失败：{}", python.display()),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    let text = if stdout.is_empty() { stderr } else { stdout };

    if text.is_empty() {
        return Err(blocking(
            "PYTHON_OUTPUT_EMPTY",
            "Python 探测未返回版本或导入结果",
        ));
    }

    Ok(text)
}

fn blocking(code: &str, message: impl Into<String>) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        message: message.into(),
        severity: Severity::Blocking,
        evidence: None,
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::map_child_timeout;

    #[test]
    fn timed_out_python_probe_returns_python_timeout_diagnostic() {
        let result = map_child_timeout(Duration::from_secs(8));

        assert_eq!(result.code, "PYTHON_TIMEOUT");
    }
}
