use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use chrono::{TimeZone, Utc};
use comfyneko_core::{
    domain::{
        asset::{AssetKind, AssetObservation, AssetRootKind},
        asset_thumbnail::AssetThumbnailState,
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_repository::AssetRepository, environment_repository::EnvironmentRepository,
    },
    services::{
        asset_thumbnail_service::{AssetThumbnailError, AssetThumbnailService},
        path_guard::{validate_allowed_file, PathGuardError},
    },
};
use image::{GenericImageView, ImageFormat, Rgb, RgbImage};
use tempfile::TempDir;
use uuid::Uuid;

#[test]
fn safe_file_validation_accepts_files_inside_roots_and_rejects_escape_paths() {
    let temp_dir = tempfile::tempdir().unwrap();
    let allowed_root = temp_dir.path().join("output");
    let outside_root = temp_dir.path().join("outside");
    fs::create_dir_all(&allowed_root).unwrap();
    fs::create_dir_all(&outside_root).unwrap();
    let allowed_file = allowed_root.join("preview.png");
    let outside_file = outside_root.join("preview.png");
    fs::write(&allowed_file, b"inside").unwrap();
    fs::write(&outside_file, b"outside").unwrap();

    assert_eq!(
        validate_allowed_file(&allowed_file, &[allowed_root]).unwrap(),
        dunce::canonicalize(&allowed_file).unwrap()
    );
    assert_eq!(
        validate_allowed_file(&outside_file, &[temp_dir.path().join("output")]),
        Err(PathGuardError::OutsideAllowedRoots)
    );
}

#[tokio::test]
async fn unsupported_and_unavailable_assets_do_not_start_thumbnail_generation() {
    let fixture = ThumbnailFixture::new().await;
    let video_id = fixture
        .insert(
            AssetRootKind::Output,
            AssetKind::Video,
            fixture.output_root.join("preview.mp4"),
        )
        .await;
    let gif_id = fixture
        .insert(
            AssetRootKind::Output,
            AssetKind::Image,
            fixture.output_root.join("animated.gif"),
        )
        .await;
    let missing_id = fixture
        .insert(
            AssetRootKind::Output,
            AssetKind::Image,
            fixture.output_root.join("missing.png"),
        )
        .await;
    let outside_path = fixture.temp_dir.path().join("outside.png");
    fs::write(&outside_path, b"outside").unwrap();
    let outside_id = fixture
        .insert(AssetRootKind::Output, AssetKind::Image, outside_path)
        .await;

    assert_eq!(
        fixture.service.get_or_create(video_id).await.unwrap().state,
        AssetThumbnailState::Unsupported
    );
    assert_eq!(
        fixture.service.get_or_create(gif_id).await.unwrap().state,
        AssetThumbnailState::Unsupported
    );
    assert_eq!(
        fixture
            .service
            .get_or_create(missing_id)
            .await
            .unwrap()
            .state,
        AssetThumbnailState::Unavailable
    );
    assert_eq!(
        fixture
            .service
            .get_or_create(outside_id)
            .await
            .unwrap()
            .state,
        AssetThumbnailState::Unavailable
    );
}

#[tokio::test]
async fn unknown_asset_ids_return_a_stable_service_error() {
    let fixture = ThumbnailFixture::new().await;
    let asset_id = Uuid::new_v4();

    assert!(matches!(
        fixture.service.get_or_create(asset_id).await,
        Err(AssetThumbnailError::AssetNotFound(id)) if id == asset_id
    ));
}

#[tokio::test]
async fn generates_webp_thumbnail_without_modifying_source_and_reuses_cache() {
    let fixture = ThumbnailFixture::new().await;
    let source_path = fixture.output_root.join("large-preview.png");
    save_png(&source_path, 1_200, 800, [38, 108, 184]);
    let original_bytes = fs::read(&source_path).unwrap();
    let original_metadata = fs::metadata(&source_path).unwrap();
    let asset_id = fixture
        .insert(AssetRootKind::Output, AssetKind::Image, source_path.clone())
        .await;

    let first = fixture.service.get_or_create(asset_id).await.unwrap();

    assert_eq!(first.state, AssetThumbnailState::Ready);
    let first_path = first.cache_path.unwrap();
    assert!(first_path.starts_with(fixture.cache_root.join("v1")));
    assert_eq!(first_path.extension().unwrap(), "webp");
    assert_eq!(image::open(&first_path).unwrap().dimensions(), (640, 427));
    assert_eq!(fs::read(&source_path).unwrap(), original_bytes);
    assert_eq!(
        fs::metadata(&source_path).unwrap().len(),
        original_metadata.len()
    );
    assert_eq!(
        fs::metadata(&source_path).unwrap().modified().unwrap(),
        original_metadata.modified().unwrap()
    );

    let first_mtime = fs::metadata(&first_path).unwrap().modified().unwrap();
    let second = fixture.service.get_or_create(asset_id).await.unwrap();

    assert_eq!(second.state, AssetThumbnailState::Ready);
    assert_eq!(second.cache_path.as_deref(), Some(first_path.as_path()));
    assert_eq!(
        fs::metadata(&first_path).unwrap().modified().unwrap(),
        first_mtime
    );
}

#[tokio::test]
async fn invalid_and_oversized_images_leave_no_final_cache_files() {
    let fixture = ThumbnailFixture::new().await;
    let invalid_path = fixture.output_root.join("invalid.png");
    let truncated_path = fixture.output_root.join("truncated.jpg");
    let oversized_path = fixture.output_root.join("oversized.png");
    fs::write(&invalid_path, b"not an image").unwrap();
    fs::write(&truncated_path, [0xff, 0xd8, 0xff, 0xe0]).unwrap();
    fs::write(&oversized_path, oversized_png_header()).unwrap();
    let invalid_id = fixture
        .insert(AssetRootKind::Output, AssetKind::Image, invalid_path)
        .await;
    let truncated_id = fixture
        .insert(AssetRootKind::Output, AssetKind::Image, truncated_path)
        .await;
    let oversized_id = fixture
        .insert(AssetRootKind::Output, AssetKind::Image, oversized_path)
        .await;

    for asset_id in [invalid_id, truncated_id, oversized_id] {
        assert_eq!(
            fixture.service.get_or_create(asset_id).await.unwrap().state,
            AssetThumbnailState::Unavailable
        );
    }
    assert!(files_with_extension(&fixture.cache_root, "webp").is_empty());
}

#[tokio::test]
async fn source_changes_replace_stale_thumbnail_cache_entries() {
    let fixture = ThumbnailFixture::new().await;
    let source_path = fixture.output_root.join("changing-preview.png");
    save_png(&source_path, 1_200, 800, [28, 96, 168]);
    let asset_id = fixture
        .insert(AssetRootKind::Output, AssetKind::Image, source_path.clone())
        .await;
    let first_path = fixture
        .service
        .get_or_create(asset_id)
        .await
        .unwrap()
        .cache_path
        .unwrap();

    save_png(&source_path, 900, 1_200, [184, 82, 62]);
    let mut source = fs::OpenOptions::new()
        .append(true)
        .open(&source_path)
        .unwrap();
    source.write_all(b"cache invalidation").unwrap();
    source.sync_all().unwrap();
    let second = fixture.service.get_or_create(asset_id).await.unwrap();
    let second_path = second.cache_path.unwrap();

    assert_eq!(second.state, AssetThumbnailState::Ready);
    assert_ne!(second_path, first_path);
    assert!(!first_path.exists());
    assert!(second_path.is_file());
    assert_eq!(
        files_for_asset(&fixture.cache_root, asset_id),
        vec![second_path]
    );
}

#[tokio::test]
async fn concurrent_requests_share_one_final_cache_file_without_temporary_files() {
    let fixture = ThumbnailFixture::new().await;
    let source_path = fixture.output_root.join("concurrent-preview.png");
    save_png(&source_path, 1_200, 800, [64, 132, 92]);
    let asset_id = fixture
        .insert(AssetRootKind::Output, AssetKind::Image, source_path)
        .await;

    let (left, right) = tokio::join!(
        fixture.service.get_or_create(asset_id),
        fixture.service.get_or_create(asset_id)
    );
    let left_path = left.unwrap().cache_path.unwrap();
    let right_path = right.unwrap().cache_path.unwrap();

    assert_eq!(left_path, right_path);
    assert_eq!(
        files_for_asset(&fixture.cache_root, asset_id),
        vec![left_path]
    );
    assert!(files_with_extension(&fixture.cache_root, "tmp").is_empty());
}

struct ThumbnailFixture {
    temp_dir: TempDir,
    environment: EnvironmentProfile,
    assets: AssetRepository,
    output_root: PathBuf,
    cache_root: PathBuf,
    service: AssetThumbnailService,
}

impl ThumbnailFixture {
    async fn new() -> Self {
        let temp_dir = tempfile::tempdir().unwrap();
        let database_path = temp_dir.path().join("comfyneko.db");
        let comfy_root = temp_dir.path().join("ComfyUI");
        let input_root = comfy_root.join("input");
        let output_root = comfy_root.join("output");
        fs::create_dir_all(&input_root).unwrap();
        fs::create_dir_all(&output_root).unwrap();

        let environments = EnvironmentRepository::connect_file(&database_path)
            .await
            .unwrap();
        let mut environment = EnvironmentProfile::new("缩略图测试环境", comfy_root);
        environment.roots.input = vec![input_root];
        environment.roots.output = vec![output_root.clone()];
        environments.save_if_valid(&environment, &[]).await.unwrap();
        let assets = AssetRepository::connect_file(&database_path).await.unwrap();
        let cache_root = temp_dir.path().join("cache").join("thumbnails");
        let service = AssetThumbnailService::new(assets.clone(), environments, cache_root.clone());

        Self {
            temp_dir,
            environment,
            assets,
            output_root,
            cache_root,
            service,
        }
    }

    async fn insert(&self, root_kind: AssetRootKind, kind: AssetKind, path: PathBuf) -> Uuid {
        self.assets
            .upsert(&AssetObservation {
                environment_id: self.environment.id,
                root_kind,
                normalized_path: path,
                kind,
                size_bytes: 64,
                modified_at: Some(Utc.with_ymd_and_hms(2026, 9, 4, 12, 0, 0).single().unwrap()),
            })
            .await
            .unwrap()
            .record()
            .id
    }
}

fn save_png(path: &Path, width: u32, height: u32, color: [u8; 3]) {
    RgbImage::from_pixel(width, height, Rgb(color))
        .save_with_format(path, ImageFormat::Png)
        .unwrap();
}

fn files_with_extension(root: &Path, extension: &str) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut files = Vec::new();

    for entry in entries {
        let path = entry.unwrap().path();
        if path.is_dir() {
            files.extend(files_with_extension(&path, extension));
        } else if path.extension().and_then(|value| value.to_str()) == Some(extension) {
            files.push(path);
        }
    }

    files
}

fn files_for_asset(root: &Path, asset_id: Uuid) -> Vec<PathBuf> {
    let prefix = format!("{}-", asset_id.simple());
    let mut files = files_with_extension(root, "webp")
        .into_iter()
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.starts_with(&prefix))
        })
        .collect::<Vec<_>>();
    files.sort();
    files
}

fn oversized_png_header() -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&20_000_u32.to_be_bytes());
    ihdr.extend_from_slice(&20_000_u32.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    bytes.extend(png_chunk(*b"IHDR", &ihdr));
    bytes.extend(png_chunk(*b"IEND", &[]));
    bytes
}

fn png_chunk(kind: [u8; 4], data: &[u8]) -> Vec<u8> {
    let mut chunk = Vec::with_capacity(data.len() + 12);
    chunk.extend_from_slice(&(data.len() as u32).to_be_bytes());
    chunk.extend_from_slice(&kind);
    chunk.extend_from_slice(data);
    let mut crc_input = kind.to_vec();
    crc_input.extend_from_slice(data);
    chunk.extend_from_slice(&crc32(&crc_input).to_be_bytes());
    chunk
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = u32::MAX;

    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }

    !crc
}
