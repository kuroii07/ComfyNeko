use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::domain::asset::{AssetKind, AssetObservation, AssetRootKind, AssetScanRoot};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveryIssue {
    pub path: PathBuf,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DiscoveryReport {
    pub observations: Vec<AssetObservation>,
    pub issues: Vec<DiscoveryIssue>,
}

pub fn classify_asset(root_kind: AssetRootKind, path: &Path) -> Option<AssetKind> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();

    match root_kind {
        AssetRootKind::Input | AssetRootKind::Output => match extension.as_str() {
            "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "tif" | "tiff" | "avif" => {
                Some(AssetKind::Image)
            }
            "mp4" | "webm" | "mov" | "mkv" | "avi" => Some(AssetKind::Video),
            "wav" | "mp3" | "flac" | "ogg" | "m4a" | "aac" => Some(AssetKind::Audio),
            _ => None,
        },
        AssetRootKind::Models => match extension.as_str() {
            "safetensors" | "ckpt" | "pt" | "pth" | "bin" => Some(AssetKind::Model),
            _ => None,
        },
        AssetRootKind::Workflows => match extension.as_str() {
            "json" => Some(AssetKind::Workflow),
            _ => None,
        },
    }
}

pub fn discover_assets(environment_id: Uuid, roots: &[AssetScanRoot]) -> DiscoveryReport {
    let mut report = DiscoveryReport::default();
    let mut seen = HashSet::new();

    for scan_root in roots {
        discover_root(environment_id, scan_root, &mut seen, &mut report);
    }

    report
        .observations
        .sort_by(|left, right| left.normalized_path.cmp(&right.normalized_path));
    report.issues.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.code.cmp(&right.code))
    });
    report
}

fn discover_root(
    environment_id: Uuid,
    scan_root: &AssetScanRoot,
    seen: &mut HashSet<(Uuid, PathBuf)>,
    report: &mut DiscoveryReport,
) {
    let root_metadata = match fs::metadata(&scan_root.path) {
        Ok(metadata) => metadata,
        Err(error) => {
            let code = if error.kind() == std::io::ErrorKind::NotFound {
                "ASSET_ROOT_NOT_FOUND"
            } else {
                "ASSET_ROOT_UNREADABLE"
            };
            report.issues.push(issue(&scan_root.path, code, error));
            return;
        }
    };

    if !root_metadata.is_dir() {
        report.issues.push(DiscoveryIssue {
            path: scan_root.path.clone(),
            code: "ASSET_ROOT_NOT_DIRECTORY".to_owned(),
            message: format!("资产根路径不是目录：{}", scan_root.path.display()),
        });
        return;
    }

    let canonical_root = match dunce::canonicalize(&scan_root.path) {
        Ok(path) => path,
        Err(error) => {
            report
                .issues
                .push(issue(&scan_root.path, "ASSET_ROOT_UNREADABLE", error));
            return;
        }
    };
    let mut pending = vec![canonical_root.clone()];

    while let Some(directory) = pending.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                let code = if directory == canonical_root {
                    "ASSET_ROOT_UNREADABLE"
                } else {
                    "ASSET_ENTRY_UNREADABLE"
                };
                report.issues.push(issue(&directory, code, error));
                continue;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    report
                        .issues
                        .push(issue(&directory, "ASSET_ENTRY_UNREADABLE", error));
                    continue;
                }
            };
            let path = entry.path();
            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(error) => {
                    report
                        .issues
                        .push(issue(&path, "ASSET_ENTRY_UNREADABLE", error));
                    continue;
                }
            };

            if metadata.file_type().is_symlink() {
                continue;
            }

            let normalized_path = match dunce::canonicalize(&path) {
                Ok(path) => path,
                Err(error) => {
                    report
                        .issues
                        .push(issue(&path, "ASSET_ENTRY_UNREADABLE", error));
                    continue;
                }
            };

            if !normalized_path.starts_with(&canonical_root) {
                report.issues.push(DiscoveryIssue {
                    path: normalized_path,
                    code: "ASSET_PATH_ESCAPES_ROOT".to_owned(),
                    message: format!("资产路径超出允许目录：{}", path.display()),
                });
                continue;
            }

            if metadata.is_dir() {
                pending.push(normalized_path);
                continue;
            }

            if !metadata.is_file() {
                continue;
            }

            let Some(kind) = classify_asset(scan_root.kind, &normalized_path) else {
                continue;
            };
            let identity = (environment_id, normalized_path.clone());
            if !seen.insert(identity) {
                continue;
            }

            report.observations.push(AssetObservation {
                environment_id,
                root_kind: scan_root.kind,
                normalized_path,
                kind,
                size_bytes: metadata.len(),
                modified_at: metadata.modified().ok().map(DateTime::<Utc>::from),
            });
        }
    }
}

fn issue(path: &Path, code: &str, error: impl std::fmt::Display) -> DiscoveryIssue {
    DiscoveryIssue {
        path: path.to_path_buf(),
        code: code.to_owned(),
        message: format!("无法读取资产路径 {}：{error}", path.display()),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
    };

    use tempfile::tempdir;
    use uuid::Uuid;

    use crate::domain::asset::{AssetKind, AssetRootKind, AssetScanRoot};

    use super::{classify_asset, discover_assets};

    #[test]
    fn classifies_supported_extensions_case_insensitively() {
        let cases = [
            (AssetRootKind::Input, "preview.PNG", Some(AssetKind::Image)),
            (AssetRootKind::Output, "clip.MP4", Some(AssetKind::Video)),
            (AssetRootKind::Output, "voice.FLAC", Some(AssetKind::Audio)),
            (
                AssetRootKind::Models,
                "flux.SAFETENSORS",
                Some(AssetKind::Model),
            ),
            (
                AssetRootKind::Workflows,
                "portrait.JSON",
                Some(AssetKind::Workflow),
            ),
        ];

        for (root_kind, path, expected) in cases {
            assert_eq!(classify_asset(root_kind, Path::new(path)), expected);
        }
    }

    #[test]
    fn rejects_extensions_that_do_not_match_the_root_role() {
        assert_eq!(
            classify_asset(AssetRootKind::Input, Path::new("workflow.json")),
            None
        );
        assert_eq!(
            classify_asset(AssetRootKind::Models, Path::new("preview.png")),
            None
        );
        assert_eq!(
            classify_asset(AssetRootKind::Output, Path::new("notes.txt")),
            None
        );
    }

    #[test]
    fn discovers_supported_assets_recursively_without_writing_to_the_roots() {
        let temp_dir = tempdir().unwrap();
        let input_root = temp_dir.path().join("input");
        let model_root = temp_dir.path().join("models");
        let workflow_root = temp_dir.path().join("workflows");
        fs::create_dir_all(input_root.join("nested")).unwrap();
        fs::create_dir_all(model_root.join("checkpoints")).unwrap();
        fs::create_dir_all(&workflow_root).unwrap();
        fs::write(input_root.join("reference.PNG"), b"image").unwrap();
        fs::write(input_root.join("nested").join("animation.mp4"), b"video").unwrap();
        fs::write(input_root.join("ignored.txt"), b"ignored").unwrap();
        fs::write(
            model_root.join("checkpoints").join("flux.safetensors"),
            b"model",
        )
        .unwrap();
        fs::write(workflow_root.join("portrait.json"), b"{}").unwrap();
        let before = snapshot(&[
            input_root.clone(),
            model_root.clone(),
            workflow_root.clone(),
        ]);

        let report = discover_assets(
            Uuid::nil(),
            &[
                AssetScanRoot {
                    kind: AssetRootKind::Input,
                    path: input_root.clone(),
                },
                AssetScanRoot {
                    kind: AssetRootKind::Models,
                    path: model_root.clone(),
                },
                AssetScanRoot {
                    kind: AssetRootKind::Workflows,
                    path: workflow_root.clone(),
                },
            ],
        );

        let mut actual = report
            .observations
            .iter()
            .map(|asset| {
                (
                    asset
                        .normalized_path
                        .file_name()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned(),
                    asset.kind,
                )
            })
            .collect::<Vec<_>>();
        actual.sort_by(|left, right| left.0.cmp(&right.0));

        assert!(report.issues.is_empty());
        assert_eq!(
            actual,
            vec![
                ("animation.mp4".to_owned(), AssetKind::Video),
                ("flux.safetensors".to_owned(), AssetKind::Model),
                ("portrait.json".to_owned(), AssetKind::Workflow),
                ("reference.PNG".to_owned(), AssetKind::Image),
            ]
        );
        assert_eq!(before, snapshot(&[input_root, model_root, workflow_root]));
    }

    #[test]
    fn reports_invalid_roots_without_discarding_valid_observations() {
        let temp_dir = tempdir().unwrap();
        let valid_root = temp_dir.path().join("input");
        let file_root = temp_dir.path().join("not-a-directory");
        let missing_root = temp_dir.path().join("missing");
        fs::create_dir_all(&valid_root).unwrap();
        fs::write(valid_root.join("kept.png"), b"image").unwrap();
        fs::write(&file_root, b"file").unwrap();

        let report = discover_assets(
            Uuid::nil(),
            &[
                AssetScanRoot {
                    kind: AssetRootKind::Input,
                    path: valid_root,
                },
                AssetScanRoot {
                    kind: AssetRootKind::Input,
                    path: file_root,
                },
                AssetScanRoot {
                    kind: AssetRootKind::Input,
                    path: missing_root,
                },
            ],
        );

        assert_eq!(report.observations.len(), 1);
        assert_eq!(
            report
                .issues
                .iter()
                .map(|issue| issue.code.as_str())
                .collect::<Vec<_>>(),
            vec!["ASSET_ROOT_NOT_FOUND", "ASSET_ROOT_NOT_DIRECTORY"]
        );
    }

    #[test]
    fn repeated_roots_do_not_emit_duplicate_observations() {
        let temp_dir = tempdir().unwrap();
        let root = temp_dir.path().join("output");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("result.webp"), b"image").unwrap();
        let scan_root = AssetScanRoot {
            kind: AssetRootKind::Output,
            path: root,
        };

        let report = discover_assets(Uuid::nil(), &[scan_root.clone(), scan_root]);

        assert_eq!(report.observations.len(), 1);
    }

    #[test]
    fn does_not_follow_directory_symlinks() {
        let temp_dir = tempdir().unwrap();
        let root = temp_dir.path().join("input");
        let outside = temp_dir.path().join("outside");
        let link = root.join("linked");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.png"), b"secret").unwrap();

        if create_directory_symlink(&outside, &link).is_err() {
            return;
        }

        let report = discover_assets(
            Uuid::nil(),
            &[AssetScanRoot {
                kind: AssetRootKind::Input,
                path: root,
            }],
        );

        assert!(report.observations.is_empty());
    }

    fn snapshot(roots: &[PathBuf]) -> Vec<(PathBuf, u64)> {
        let mut pending = roots.to_vec();
        let mut entries = Vec::new();

        while let Some(directory) = pending.pop() {
            for entry in fs::read_dir(directory).unwrap() {
                let entry = entry.unwrap();
                let metadata = entry.metadata().unwrap();
                let path = entry.path();
                entries.push((path.clone(), metadata.len()));
                if metadata.is_dir() {
                    pending.push(path);
                }
            }
        }

        entries.sort_by(|left, right| left.0.cmp(&right.0));
        entries
    }

    #[cfg(windows)]
    fn create_directory_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_dir(target, link)
    }

    #[cfg(unix)]
    fn create_directory_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }
}
