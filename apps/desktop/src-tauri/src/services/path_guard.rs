//! Safe, normalized path checks for read-only environment discovery.

use std::path::{Path, PathBuf};

use crate::domain::diagnostic::{Diagnostic, Severity};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathGuardError {
    Unreadable,
    NotFile,
    OutsideAllowedRoots,
}

pub fn validate_allowed_root(path: &Path) -> Result<PathBuf, Diagnostic> {
    let normalized = dunce::canonicalize(path).map_err(|_| Diagnostic {
        code: "PATH_UNREADABLE".to_owned(),
        message: format!("无法读取目录：{}", path.display()),
        severity: Severity::Blocking,
        evidence: None,
    })?;

    if !normalized.is_dir() {
        return Err(Diagnostic {
            code: "PATH_NOT_DIRECTORY".to_owned(),
            message: format!("路径不是目录：{}", path.display()),
            severity: Severity::Blocking,
            evidence: None,
        });
    }

    Ok(normalized)
}

pub fn validate_allowed_file(
    path: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, PathGuardError> {
    let normalized = dunce::canonicalize(path).map_err(|_| PathGuardError::Unreadable)?;

    if !normalized.is_file() {
        return Err(PathGuardError::NotFile);
    }

    for root in allowed_roots {
        let normalized_root = dunce::canonicalize(root).map_err(|_| PathGuardError::Unreadable)?;

        if normalized.starts_with(normalized_root) {
            return Ok(normalized);
        }
    }

    Err(PathGuardError::OutsideAllowedRoots)
}
