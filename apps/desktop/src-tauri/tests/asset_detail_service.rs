use std::{fs, path::PathBuf};

use chrono::{TimeZone, Utc};
use comfyneko_core::{
    domain::{
        asset::{AssetKind, AssetObservation, AssetRootKind},
        asset_detail::{AssetDetailMetadataState, AssetMetadataSource},
        environment::EnvironmentProfile,
    },
    repositories::{
        asset_metadata_repository::AssetMetadataRepository, asset_repository::AssetRepository,
        environment_repository::EnvironmentRepository,
    },
    services::asset_detail_service::AssetDetailService,
};
use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
use tempfile::TempDir;

#[tokio::test]
async fn reads_embedded_prompt_and_workflow_without_changing_the_png() {
    let fixture = DetailFixture::new().await;
    let source_path = fixture.output_root.join("metadata.png");
    let prompt = r#"{"1":{"class_type":"CLIPTextEncode","inputs":{"text":"cat"}}}"#;
    let workflow = r#"{"last_node_id":1,"nodes":[]}"#;
    write_png_with_text_chunks(&source_path, [("prompt", prompt), ("workflow", workflow)]);
    let original_bytes = fs::read(&source_path).unwrap();
    let original_modified = fs::metadata(&source_path).unwrap().modified().unwrap();
    let asset_id = fixture.insert(source_path).await;

    let first = fixture.service.get(asset_id).await.unwrap();
    let metadata = first.metadata.unwrap();

    assert_eq!(metadata.state, AssetDetailMetadataState::Available);
    assert_eq!(metadata.source, Some(AssetMetadataSource::PngMetadata));
    assert_eq!(metadata.prompt_text.as_deref(), Some(prompt));
    assert_eq!(metadata.workflow_text.as_deref(), Some(workflow));
    assert_eq!(
        fs::read(&first.asset.normalized_path).unwrap(),
        original_bytes
    );
    assert_eq!(
        fs::metadata(&first.asset.normalized_path)
            .unwrap()
            .modified()
            .unwrap(),
        original_modified
    );

    let second = fixture.service.get(asset_id).await.unwrap();
    assert_eq!(second.metadata, Some(metadata));
}

struct DetailFixture {
    _temp_dir: TempDir,
    environment: EnvironmentProfile,
    assets: AssetRepository,
    output_root: PathBuf,
    service: AssetDetailService,
}

impl DetailFixture {
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
        let mut environment = EnvironmentProfile::new("详情测试环境", comfy_root);
        environment.roots.input = vec![input_root];
        environment.roots.output = vec![output_root.clone()];
        environments.save_if_valid(&environment, &[]).await.unwrap();
        let assets = AssetRepository::connect_file(&database_path).await.unwrap();
        let metadata = AssetMetadataRepository::from_pool(
            sqlx::SqlitePool::connect(&format!("sqlite:{}", database_path.display()))
                .await
                .unwrap(),
        )
        .await
        .unwrap();
        let service = AssetDetailService::new(assets.clone(), environments, metadata);

        Self {
            _temp_dir: temp_dir,
            environment,
            assets,
            output_root,
            service,
        }
    }

    async fn insert(&self, path: PathBuf) -> uuid::Uuid {
        let source_metadata = fs::metadata(&path).unwrap();
        self.assets
            .upsert(&AssetObservation {
                environment_id: self.environment.id,
                root_kind: AssetRootKind::Output,
                normalized_path: dunce::canonicalize(path).unwrap(),
                kind: AssetKind::Image,
                size_bytes: source_metadata.len(),
                modified_at: Some(Utc.with_ymd_and_hms(2026, 9, 4, 9, 0, 0).single().unwrap()),
            })
            .await
            .unwrap()
            .record()
            .id
    }
}

fn write_png_with_text_chunks(path: &std::path::Path, chunks: [(&str, &str); 2]) {
    let mut bytes = Vec::new();
    PngEncoder::new(&mut bytes)
        .write_image(&[30, 80, 140, 255], 1, 1, ColorType::Rgba8.into())
        .unwrap();
    let iend_offset = find_chunk_offset(&bytes, *b"IEND");
    let mut output = bytes[..iend_offset].to_vec();

    for (key, value) in chunks {
        let mut text = key.as_bytes().to_vec();
        text.push(0);
        text.extend_from_slice(value.as_bytes());
        append_chunk(&mut output, *b"tEXt", &text);
    }

    output.extend_from_slice(&bytes[iend_offset..]);
    fs::write(path, output).unwrap();
}

fn find_chunk_offset(bytes: &[u8], expected_kind: [u8; 4]) -> usize {
    let mut offset = 8;
    while offset + 12 <= bytes.len() {
        let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let kind: [u8; 4] = bytes[offset + 4..offset + 8].try_into().unwrap();
        if kind == expected_kind {
            return offset;
        }
        offset += length + 12;
    }
    panic!("expected PNG chunk was not found");
}

fn append_chunk(bytes: &mut Vec<u8>, kind: [u8; 4], data: &[u8]) {
    bytes.extend_from_slice(&(data.len() as u32).to_be_bytes());
    bytes.extend_from_slice(&kind);
    bytes.extend_from_slice(data);
    bytes.extend_from_slice(&crc32(&[kind.as_slice(), data].concat()).to_be_bytes());
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                0xedb8_8320 ^ (crc >> 1)
            } else {
                crc >> 1
            };
        }
    }
    !crc
}
