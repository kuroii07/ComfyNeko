use std::{
    fs::{self, File},
    io::{BufReader, Read, Seek, SeekFrom},
    path::Path,
};

use chrono::{DateTime, Utc};
use flate2::read::ZlibDecoder;
use uuid::Uuid;

use crate::{
    domain::{
        asset::{AssetAvailability, AssetKind, AssetRootKind},
        asset_detail::{
            AssetDetail, AssetDetailMetadata, AssetDetailMetadataState, AssetMetadataSource,
            AssetMetadataState, CachedAssetPngMetadata,
        },
    },
    repositories::{
        asset_metadata_repository::AssetMetadataRepository, asset_repository::AssetRepository,
        environment_repository::EnvironmentRepository,
    },
    services::path_guard::validate_allowed_file,
};

const PNG_METADATA_PARSER_VERSION: &str = "v1";
const MAX_METADATA_FIELD_BYTES: usize = 2 * 1024 * 1024;
const MAX_METADATA_TOTAL_BYTES: usize = 4 * 1024 * 1024;
const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

pub struct AssetDetailService {
    assets: AssetRepository,
    environments: EnvironmentRepository,
    metadata: AssetMetadataRepository,
}

#[derive(Debug)]
pub enum AssetDetailError {
    AssetNotFound(Uuid),
    Database(String),
    MetadataRead(String),
}

impl AssetDetailService {
    pub fn new(
        assets: AssetRepository,
        environments: EnvironmentRepository,
        metadata: AssetMetadataRepository,
    ) -> Self {
        Self {
            assets,
            environments,
            metadata,
        }
    }

    pub async fn get(&self, asset_id: Uuid) -> Result<AssetDetail, AssetDetailError> {
        let Some(asset) = self
            .assets
            .get(asset_id)
            .await
            .map_err(|error| AssetDetailError::Database(error.to_string()))?
        else {
            return Err(AssetDetailError::AssetNotFound(asset_id));
        };

        let metadata = self.metadata_for(&asset).await?;
        Ok(AssetDetail { asset, metadata })
    }

    async fn metadata_for(
        &self,
        asset: &crate::domain::asset::AssetListItem,
    ) -> Result<Option<AssetDetailMetadata>, AssetDetailError> {
        if asset.kind != AssetKind::Image || asset.root_kind.is_non_media_root() {
            return Ok(Some(AssetDetailMetadata::unsupported()));
        }
        if asset.availability != AssetAvailability::Present {
            return Ok(Some(AssetDetailMetadata::unavailable()));
        }
        if !is_png(&asset.normalized_path) {
            return Ok(Some(AssetDetailMetadata::unsupported()));
        }

        let Some(environment) = self
            .environments
            .get(asset.environment_id)
            .await
            .map_err(|error| AssetDetailError::Database(error.to_string()))?
        else {
            return Ok(Some(AssetDetailMetadata::unavailable()));
        };
        let allowed_roots = match asset.root_kind {
            AssetRootKind::Input => environment.roots.input,
            AssetRootKind::Output => environment.roots.output,
            AssetRootKind::Models | AssetRootKind::Workflows => {
                return Ok(Some(AssetDetailMetadata::unsupported()))
            }
        };
        let source_path = match validate_allowed_file(&asset.normalized_path, &allowed_roots) {
            Ok(path) => path,
            Err(_) => return Ok(Some(AssetDetailMetadata::unavailable())),
        };
        let source_metadata = match fs::metadata(&source_path) {
            Ok(metadata) => metadata,
            Err(_) => return Ok(Some(AssetDetailMetadata::unavailable())),
        };
        let source_modified_at = match source_metadata.modified() {
            Ok(value) => DateTime::<Utc>::from(value),
            Err(_) => return Ok(Some(AssetDetailMetadata::unavailable())),
        };

        if let Some(cached) = self
            .metadata
            .get_png_metadata(asset.id)
            .await
            .map_err(|error| AssetDetailError::Database(error.to_string()))?
            .filter(|cached| cache_matches(cached, source_metadata.len(), source_modified_at))
        {
            return Ok(Some(AssetDetailMetadata::from_cached(cached)));
        }

        let source_path_for_read = source_path.clone();
        let parsed = tokio::task::spawn_blocking(move || parse_png_metadata(&source_path_for_read))
            .await
            .map_err(|error| AssetDetailError::MetadataRead(error.to_string()))?;
        let Ok(parsed) = parsed else {
            return Ok(Some(AssetDetailMetadata::unavailable()));
        };
        let cached = CachedAssetPngMetadata {
            asset_id: asset.id,
            parser_version: PNG_METADATA_PARSER_VERSION.to_owned(),
            source_size_bytes: source_metadata.len(),
            source_modified_at,
            state: parsed.state,
            prompt_text: parsed.prompt_text,
            workflow_text: parsed.workflow_text,
            parsed_at: Utc::now(),
        };
        self.metadata
            .upsert_png_metadata(&cached)
            .await
            .map_err(|error| AssetDetailError::Database(error.to_string()))?;

        Ok(Some(AssetDetailMetadata::from_cached(cached)))
    }
}

impl AssetRootKind {
    const fn is_non_media_root(self) -> bool {
        matches!(self, Self::Models | Self::Workflows)
    }
}

impl AssetDetailMetadata {
    fn from_cached(cached: CachedAssetPngMetadata) -> Self {
        Self {
            state: match cached.state {
                AssetMetadataState::Available => AssetDetailMetadataState::Available,
                AssetMetadataState::Empty => AssetDetailMetadataState::Empty,
                AssetMetadataState::Invalid => AssetDetailMetadataState::Invalid,
            },
            source: Some(AssetMetadataSource::PngMetadata),
            prompt_text: cached.prompt_text,
            workflow_text: cached.workflow_text,
            parsed_at: Some(cached.parsed_at),
        }
    }

    const fn unsupported() -> Self {
        Self {
            state: AssetDetailMetadataState::Unsupported,
            source: None,
            prompt_text: None,
            workflow_text: None,
            parsed_at: None,
        }
    }

    const fn unavailable() -> Self {
        Self {
            state: AssetDetailMetadataState::Unavailable,
            source: None,
            prompt_text: None,
            workflow_text: None,
            parsed_at: None,
        }
    }
}

struct ParsedPngMetadata {
    state: AssetMetadataState,
    prompt_text: Option<String>,
    workflow_text: Option<String>,
}

fn cache_matches(
    cached: &CachedAssetPngMetadata,
    source_size_bytes: u64,
    source_modified_at: DateTime<Utc>,
) -> bool {
    cached.parser_version == PNG_METADATA_PARSER_VERSION
        && cached.source_size_bytes == source_size_bytes
        && cached.source_modified_at == source_modified_at
}

fn is_png(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("png"))
}

fn parse_png_metadata(path: &Path) -> Result<ParsedPngMetadata, ()> {
    let file = File::open(path).map_err(|_| ())?;
    let mut reader = BufReader::new(file);
    let mut signature = [0; PNG_SIGNATURE.len()];
    reader.read_exact(&mut signature).map_err(|_| ())?;
    if signature != PNG_SIGNATURE {
        return Err(());
    }
    let mut prompt_text = None;
    let mut workflow_text = None;

    loop {
        let length = read_chunk_length(&mut reader)?;
        let mut kind = [0; 4];
        reader.read_exact(&mut kind).map_err(|_| ())?;

        match &kind {
            b"tEXt" => {
                let data = read_metadata_chunk(&mut reader, length)?;
                let (key, value) = parse_text_chunk(&data)?;
                collect_text(&key, &value, &mut prompt_text, &mut workflow_text)?;
            }
            b"zTXt" => {
                let data = read_metadata_chunk(&mut reader, length)?;
                let (key, value) = parse_compressed_text_chunk(&data)?;
                collect_text(&key, &value, &mut prompt_text, &mut workflow_text)?;
            }
            b"iTXt" => {
                let data = read_metadata_chunk(&mut reader, length)?;
                let (key, value) = parse_international_text_chunk(&data)?;
                collect_text(&key, &value, &mut prompt_text, &mut workflow_text)?;
            }
            b"IEND" => {
                skip_chunk(&mut reader, length)?;
                break;
            }
            _ => skip_chunk(&mut reader, length)?,
        }
    }

    let state = if prompt_text.is_none() && workflow_text.is_none() {
        AssetMetadataState::Empty
    } else if [prompt_text.as_deref(), workflow_text.as_deref()]
        .into_iter()
        .flatten()
        .any(|value| serde_json::from_str::<serde_json::Value>(value).is_err())
    {
        AssetMetadataState::Invalid
    } else {
        AssetMetadataState::Available
    };

    Ok(ParsedPngMetadata {
        state,
        prompt_text,
        workflow_text,
    })
}

fn read_chunk_length(reader: &mut BufReader<File>) -> Result<usize, ()> {
    let mut bytes = [0; 4];
    reader.read_exact(&mut bytes).map_err(|_| ())?;
    usize::try_from(u32::from_be_bytes(bytes)).map_err(|_| ())
}

fn read_metadata_chunk(reader: &mut BufReader<File>, length: usize) -> Result<Vec<u8>, ()> {
    if length > MAX_METADATA_TOTAL_BYTES {
        return Err(());
    }
    let mut data = vec![0; length];
    reader.read_exact(&mut data).map_err(|_| ())?;
    skip_crc(reader)?;
    Ok(data)
}

fn skip_chunk(reader: &mut BufReader<File>, length: usize) -> Result<(), ()> {
    let length = i64::try_from(length).map_err(|_| ())?;
    reader.seek(SeekFrom::Current(length + 4)).map_err(|_| ())?;
    Ok(())
}

fn skip_crc(reader: &mut BufReader<File>) -> Result<(), ()> {
    reader.seek(SeekFrom::Current(4)).map_err(|_| ())?;
    Ok(())
}

fn parse_text_chunk(data: &[u8]) -> Result<(String, String), ()> {
    let separator = first_null(data)?;
    Ok((
        decode_latin1(&data[..separator]),
        decode_latin1(&data[separator + 1..]),
    ))
}

fn parse_compressed_text_chunk(data: &[u8]) -> Result<(String, String), ()> {
    let separator = first_null(data)?;
    if data.get(separator + 1) != Some(&0) {
        return Err(());
    }
    Ok((
        decode_latin1(&data[..separator]),
        decode_latin1(&decompress_bounded(&data[separator + 2..])?),
    ))
}

fn parse_international_text_chunk(data: &[u8]) -> Result<(String, String), ()> {
    let keyword_end = first_null(data)?;
    let compression_flag = *data.get(keyword_end + 1).ok_or(())?;
    let compression_method = *data.get(keyword_end + 2).ok_or(())?;
    let language_start = keyword_end + 3;
    let language_end = first_null(&data[language_start..])? + language_start;
    let translated_start = language_end + 1;
    let translated_end = first_null(&data[translated_start..])? + translated_start;
    let text = &data[translated_end + 1..];
    let value = match compression_flag {
        0 => String::from_utf8(text.to_vec()).map_err(|_| ())?,
        1 if compression_method == 0 => {
            String::from_utf8(decompress_bounded(text)?).map_err(|_| ())?
        }
        _ => return Err(()),
    };

    Ok((decode_latin1(&data[..keyword_end]), value))
}

fn first_null(bytes: &[u8]) -> Result<usize, ()> {
    bytes.iter().position(|byte| *byte == 0).ok_or(())
}

fn decode_latin1(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| char::from(*byte)).collect()
}

fn decompress_bounded(bytes: &[u8]) -> Result<Vec<u8>, ()> {
    let decoder = ZlibDecoder::new(bytes);
    let mut output = Vec::new();
    decoder
        .take(u64::try_from(MAX_METADATA_FIELD_BYTES + 1).map_err(|_| ())?)
        .read_to_end(&mut output)
        .map_err(|_| ())?;
    if output.len() > MAX_METADATA_FIELD_BYTES {
        return Err(());
    }
    Ok(output)
}

fn collect_text(
    key: &str,
    value: &str,
    prompt_text: &mut Option<String>,
    workflow_text: &mut Option<String>,
) -> Result<(), ()> {
    if !matches!(key, "prompt" | "workflow") {
        return Ok(());
    }
    if value.len() > MAX_METADATA_FIELD_BYTES {
        return Err(());
    }
    let next_total = prompt_text.as_deref().map_or(0, str::len)
        + workflow_text.as_deref().map_or(0, str::len)
        + value.len();
    if next_total > MAX_METADATA_TOTAL_BYTES {
        return Err(());
    }

    match key {
        "prompt" => *prompt_text = Some(value.to_owned()),
        "workflow" => *workflow_text = Some(value.to_owned()),
        _ => unreachable!(),
    }
    Ok(())
}
