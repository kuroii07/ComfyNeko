use std::{fs, path::PathBuf};

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

struct ThumbnailFixture {
    temp_dir: TempDir,
    environment: EnvironmentProfile,
    assets: AssetRepository,
    output_root: PathBuf,
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
        let service = AssetThumbnailService::new(
            assets.clone(),
            environments,
            temp_dir.path().join("cache").join("thumbnails"),
        );

        Self {
            temp_dir,
            environment,
            assets,
            output_root,
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
