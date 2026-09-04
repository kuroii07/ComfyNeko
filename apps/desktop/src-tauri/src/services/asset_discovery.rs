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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedScanRoot {
    pub kind: AssetRootKind,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DirectoryDiscovery {
    pub observations: Vec<AssetObservation>,
    pub child_directories: Vec<PathBuf>,
    pub issues: Vec<DiscoveryIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DirectoryDiscoveryOutcome {
    Completed(DirectoryDiscovery),
    Cancelled,
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
    let mut seen_assets = HashSet::new();
    let mut seen_directories = HashSet::new();

    for scan_root in roots {
        let Some(prepared_root) = prepare_scan_root(scan_root, &mut report.issues) else {
            continue;
        };
        let mut pending = vec![prepared_root.path.clone()];

        while let Some(directory) = pending.pop() {
            let directory_identity = (prepared_root.kind.as_str().to_owned(), directory.clone());
            if !seen_directories.insert(directory_identity) {
                continue;
            }

            let DirectoryDiscoveryOutcome::Completed(discovery) =
                discover_directory(environment_id, &prepared_root, &directory, || false)
            else {
                continue;
            };

            for observation in discovery.observations {
                let identity = (environment_id, observation.normalized_path.clone());
                if seen_assets.insert(identity) {
                    report.observations.push(observation);
                }
            }
            report.issues.extend(discovery.issues);
            pending.extend(discovery.child_directories.into_iter().rev());
        }
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

pub fn discover_directory(
    environment_id: Uuid,
    root: &PreparedScanRoot,
    directory: &Path,
    should_cancel: impl Fn() -> bool,
) -> DirectoryDiscoveryOutcome {
    if should_cancel() {
        return DirectoryDiscoveryOutcome::Cancelled;
    }

    let mut report = DirectoryDiscovery::default();
    if !directory.starts_with(&root.path) {
        report.issues.push(DiscoveryIssue {
            path: directory.to_path_buf(),
            code: "ASSET_PATH_ESCAPES_ROOT".to_owned(),
            message: format!("资产路径超出允许目录：{}", directory.display()),
        });
        return DirectoryDiscoveryOutcome::Completed(report);
    }

    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) => {
            let code = if directory == root.path {
                if error.kind() == std::io::ErrorKind::NotFound {
                    "ASSET_ROOT_NOT_FOUND"
                } else {
                    "ASSET_ROOT_UNREADABLE"
                }
            } else {
                "ASSET_ENTRY_UNREADABLE"
            };
            report.issues.push(issue(directory, code, error));
            return DirectoryDiscoveryOutcome::Completed(report);
        }
    };
    let mut entry_paths = Vec::new();
    for entry in entries {
        match entry {
            Ok(entry) => entry_paths.push(entry.path()),
            Err(error) => report
                .issues
                .push(issue(directory, "ASSET_ENTRY_UNREADABLE", error)),
        }
    }
    entry_paths.sort_by(|left, right| left.to_string_lossy().cmp(&right.to_string_lossy()));

    for path in entry_paths {
        if should_cancel() {
            return DirectoryDiscoveryOutcome::Cancelled;
        }

        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                report
                    .issues
                    .push(issue(&path, "ASSET_ENTRY_UNREADABLE", error));
                continue;
            }
        };
        if is_link_or_reparse_point(&metadata) {
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
        if !normalized_path.starts_with(&root.path) {
            report.issues.push(DiscoveryIssue {
                path: normalized_path,
                code: "ASSET_PATH_ESCAPES_ROOT".to_owned(),
                message: format!("资产路径超出允许目录：{}", path.display()),
            });
            continue;
        }

        if metadata.is_dir() {
            report.child_directories.push(normalized_path);
            continue;
        }
        if !metadata.is_file() {
            continue;
        }

        let Some(kind) = classify_asset(root.kind, &normalized_path) else {
            continue;
        };
        report.observations.push(AssetObservation {
            environment_id,
            root_kind: root.kind,
            normalized_path,
            kind,
            size_bytes: metadata.len(),
            modified_at: metadata.modified().ok().map(DateTime::<Utc>::from),
        });
    }

    report
        .observations
        .sort_by(|left, right| left.normalized_path.cmp(&right.normalized_path));
    report.child_directories.sort();
    report.issues.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.code.cmp(&right.code))
    });

    DirectoryDiscoveryOutcome::Completed(report)
}

fn prepare_scan_root(
    scan_root: &AssetScanRoot,
    issues: &mut Vec<DiscoveryIssue>,
) -> Option<PreparedScanRoot> {
    let root_metadata = match fs::metadata(&scan_root.path) {
        Ok(metadata) => metadata,
        Err(error) => {
            let code = if error.kind() == std::io::ErrorKind::NotFound {
                "ASSET_ROOT_NOT_FOUND"
            } else {
                "ASSET_ROOT_UNREADABLE"
            };
            issues.push(issue(&scan_root.path, code, error));
            return None;
        }
    };

    if !root_metadata.is_dir() {
        issues.push(DiscoveryIssue {
            path: scan_root.path.clone(),
            code: "ASSET_ROOT_NOT_DIRECTORY".to_owned(),
            message: format!("资产根路径不是目录：{}", scan_root.path.display()),
        });
        return None;
    }

    let canonical_root = match dunce::canonicalize(&scan_root.path) {
        Ok(path) => path,
        Err(error) => {
            issues.push(issue(&scan_root.path, "ASSET_ROOT_UNREADABLE", error));
            return None;
        }
    };

    Some(PreparedScanRoot {
        kind: scan_root.kind,
        path: canonical_root,
    })
}

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }

    #[cfg(not(windows))]
    false
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
        cell::Cell,
        fs,
        path::{Path, PathBuf},
    };

    use tempfile::tempdir;
    use uuid::Uuid;

    use crate::domain::asset::{AssetKind, AssetRootKind, AssetScanRoot};

    use super::{
        classify_asset, discover_assets, discover_directory, DirectoryDiscoveryOutcome,
        PreparedScanRoot,
    };

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

    #[test]
    fn discovers_only_direct_files_and_returns_sorted_child_directories() {
        let temp_dir = tempdir().unwrap();
        let root = temp_dir.path().join("input");
        let alpha = root.join("alpha");
        let beta = root.join("beta");
        fs::create_dir_all(&alpha).unwrap();
        fs::create_dir_all(&beta).unwrap();
        fs::write(root.join("direct.png"), b"direct").unwrap();
        fs::write(alpha.join("nested.png"), b"nested").unwrap();
        let canonical_root = dunce::canonicalize(&root).unwrap();
        let prepared = PreparedScanRoot {
            kind: AssetRootKind::Input,
            path: canonical_root.clone(),
        };

        let outcome = discover_directory(Uuid::nil(), &prepared, &canonical_root, || false);
        let DirectoryDiscoveryOutcome::Completed(report) = outcome else {
            panic!("directory discovery should complete");
        };

        assert_eq!(report.observations.len(), 1);
        assert_eq!(
            report.observations[0]
                .normalized_path
                .file_name()
                .unwrap()
                .to_string_lossy(),
            "direct.png"
        );
        assert_eq!(
            report.child_directories,
            vec![
                dunce::canonicalize(alpha).unwrap(),
                dunce::canonicalize(beta).unwrap(),
            ]
        );
    }

    #[test]
    fn cancellation_discards_partial_directory_results() {
        let temp_dir = tempdir().unwrap();
        let root = temp_dir.path().join("output");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("a.png"), b"a").unwrap();
        fs::write(root.join("b.png"), b"b").unwrap();
        let canonical_root = dunce::canonicalize(&root).unwrap();
        let prepared = PreparedScanRoot {
            kind: AssetRootKind::Output,
            path: canonical_root.clone(),
        };
        let checks = Cell::new(0_u8);

        let outcome = discover_directory(Uuid::nil(), &prepared, &canonical_root, || {
            let next = checks.get() + 1;
            checks.set(next);
            next >= 3
        });

        assert_eq!(outcome, DirectoryDiscoveryOutcome::Cancelled);
        assert!(checks.get() >= 3);
    }

    #[cfg(windows)]
    #[test]
    fn does_not_return_windows_reparse_directories_as_children() {
        let temp_dir = tempdir().unwrap();
        let root = temp_dir.path().join("input");
        let outside = temp_dir.path().join("outside");
        let link = root.join("reparse-link");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        if std::os::windows::fs::symlink_dir(&outside, &link).is_err() {
            return;
        }
        let canonical_root = dunce::canonicalize(&root).unwrap();
        let prepared = PreparedScanRoot {
            kind: AssetRootKind::Input,
            path: canonical_root.clone(),
        };

        let outcome = discover_directory(Uuid::nil(), &prepared, &canonical_root, || false);
        let DirectoryDiscoveryOutcome::Completed(report) = outcome else {
            panic!("directory discovery should complete");
        };

        assert!(report.child_directories.is_empty());
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
