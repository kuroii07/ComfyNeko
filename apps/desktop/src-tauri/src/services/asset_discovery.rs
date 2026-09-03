use std::path::Path;

use crate::domain::asset::{AssetKind, AssetRootKind};

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

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::domain::asset::{AssetKind, AssetRootKind};

    use super::classify_asset;

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
}
