# Image Thumbnail Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为媒体资产库生成并懒加载真实图片缩略图，同时把所有写入限制在 ComfyNeko 自身缓存目录。

**Architecture:** Rust Core 根据资产 ID 重新读取数据库事实和环境根目录，安全验证源图片后在 `app_local_data_dir()/cache/thumbnails/v1/` 生成 640px WebP。Tauri 仅通过受限 Asset Protocol 暴露缩略图缓存；React 卡片使用 `IntersectionObserver` 懒加载，任何单文件失败都回退现有类型占位。

**Tech Stack:** Tauri 2、Rust 2021、SQLx/SQLite、`image 0.25.10`、React 19、TypeScript、Vitest、Testing Library

**Spec:** `docs/superpowers/specs/2026-09-04-image-thumbnail-cache-design.md`

## Global Constraints

- 只支持 PNG、JPEG/JPG、WebP、BMP、TIFF/TIF 图片缩略图。
- 输出最长边固定不超过 640px，格式固定为 WebP。
- 不引入 FFmpeg；视频和音频继续使用类型占位。
- 前端只提交资产 ID，不接收任意源路径、缓存路径、尺寸或格式。
- 源文件始终只读；所有创建、替换和清理只发生在 `app_local_data_dir()/cache/thumbnails/v1/`。
- Tauri Asset Protocol 只允许 `$APPLOCALDATA/cache/thumbnails/**/*`。
- 缩略图失败不得中断资产分页、筛选、搜索或扫描任务。
- 浏览器预览不得伪造本地缩略图。
- 每个任务验证后独立提交并推送 `fix/visionhub-environment-ui`。
- 不提交数据库、缓存图片、用户媒体、`target/`、`dist/` 或安装包。

---

## File Map

### Rust domain and repositories

- Create `apps/desktop/src-tauri/src/domain/asset_thumbnail.rs`
  - 定义 `AssetThumbnail` 和 `AssetThumbnailState`。
- Modify `apps/desktop/src-tauri/src/domain/mod.rs`
  - 导出缩略图领域类型。
- Modify `apps/desktop/src-tauri/src/repositories/asset_repository.rs`
  - 增加按资产 ID 读取完整 `AssetListItem` 的方法。
- Test `apps/desktop/src-tauri/tests/asset_thumbnail_repository.rs`
  - 验证存在和不存在资产的读取契约。

### Rust thumbnail core

- Create `apps/desktop/src-tauri/src/services/asset_thumbnail_service.rs`
  - 验证资产和路径、生成缓存键、解码缩放、原子写入、清理旧版本。
- Modify `apps/desktop/src-tauri/src/services/path_guard.rs`
  - 增加普通文件位于允许根目录内的安全规范化检查。
- Modify `apps/desktop/src-tauri/src/services/mod.rs`
  - 导出缩略图服务。
- Modify `apps/desktop/src-tauri/Cargo.toml`
  - 添加最小格式集合的 `image` 依赖。
- Test `apps/desktop/src-tauri/tests/asset_thumbnail_service.rs`
  - 覆盖生成、命中、失效、失败隔离、并发和源文件只读。

### Tauri integration

- Create `apps/desktop/src-tauri/src/commands/asset_thumbnail_commands.rs`
  - 把服务错误映射成稳定命令错误。
- Modify `apps/desktop/src-tauri/src/commands/mod.rs`
  - 导出命令服务。
- Modify `apps/desktop/src-tauri/src/commands/tauri_commands.rs`
  - 注册 `get_asset_thumbnail`。
- Modify `apps/desktop/src-tauri/src/lib.rs`
  - 创建缓存目录、构造服务、加入 managed state 和 invoke handler。
- Modify `apps/desktop/src-tauri/tauri.conf.json`
  - 开启并限制 Asset Protocol。
- Test `apps/desktop/src-tauri/tests/asset_thumbnail_commands.rs`
  - 覆盖非法 ID、未知资产和稳定返回结构。

### Frontend API and component

- Create `apps/desktop/src/features/assets/assetThumbnailApi.ts`
  - 调用 Tauri 命令并把缓存路径转换为安全图片 URL。
- Create `apps/desktop/src/features/assets/assetThumbnailApi.test.ts`
  - 验证 Tauri 参数、路径转换和浏览器回退。
- Create `apps/desktop/src/features/assets/AssetThumbnail.tsx`
  - 管理观察、请求、取消旧响应、图片失败回退。
- Create `apps/desktop/src/features/assets/AssetThumbnail.test.tsx`
  - 覆盖懒加载、媒体类型边界和失败回退。
- Modify `apps/desktop/src/features/assets/AssetScanPage.tsx`
  - 将卡片预览委托给 `AssetThumbnail`。
- Modify `apps/desktop/src/features/assets/AssetScanPage.test.tsx`
  - 验证页面传递缩略图 API 且列表功能不回归。
- Modify `apps/desktop/src/styles/index.css`
  - 增加真实图片、加载状态和回退样式。

### Documentation and acceptance

- Modify `README.md`
- Modify `docs/02-技术架构与数据模型.md`
- Modify `docs/05-路线图与验收标准.md`
- Modify `docs/DEVELOPMENT_LOG.md`
- Modify `design-qa.md`

---

### Task 1: Add the asset lookup and thumbnail domain contract

**Files:**
- Create: `apps/desktop/src-tauri/src/domain/asset_thumbnail.rs`
- Modify: `apps/desktop/src-tauri/src/domain/mod.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/asset_repository.rs`
- Create: `apps/desktop/src-tauri/tests/asset_thumbnail_repository.rs`

**Interfaces:**
- Consumes: existing `AssetListItem`, `AssetRepository`, SQLite `assets` schema.
- Produces:

```rust
pub enum AssetThumbnailState {
    Ready,
    Unsupported,
    Unavailable,
}

pub struct AssetThumbnail {
    pub asset_id: Uuid,
    pub state: AssetThumbnailState,
    pub cache_path: Option<PathBuf>,
}

impl AssetThumbnail {
    pub fn ready(asset_id: Uuid, cache_path: PathBuf) -> Self;
    pub fn unsupported(asset_id: Uuid) -> Self;
    pub fn unavailable(asset_id: Uuid) -> Self;
}

impl AssetRepository {
    pub async fn get(&self, id: Uuid)
        -> Result<Option<AssetListItem>, AssetRepositoryError>;
}
```

- [ ] **Step 1: Write the failing repository tests**

Create a temporary database, insert one output image through the existing
repository API, then assert:

```rust
let item = repository.get(record.id).await.unwrap().unwrap();
assert_eq!(item.id, record.id);
assert_eq!(item.kind, AssetKind::Image);
assert_eq!(item.root_kind, AssetRootKind::Output);
assert_eq!(item.availability, AssetAvailability::Present);

assert!(repository.get(Uuid::new_v4()).await.unwrap().is_none());
```

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```powershell
cargo test --test asset_thumbnail_repository
```

Expected: compile failure because `AssetRepository::get` and the thumbnail
domain module do not exist.

- [ ] **Step 3: Add the domain types and repository query**

Use the same selected columns and `AssetListItem::try_from` mapping already
used by `AssetRepository::query`:

```rust
pub async fn get(
    &self,
    id: Uuid,
) -> Result<Option<AssetListItem>, AssetRepositoryError> {
    sqlx::query(
        r#"
        SELECT id, environment_id, root_kind, kind, normalized_path, size_bytes,
               modified_at, fingerprint, indexed_at, last_seen_at, is_present,
               missing_since
        FROM assets
        WHERE id = ?
        "#,
    )
    .bind(id.to_string())
    .fetch_optional(&self.pool)
    .await
    .map_err(AssetRepositoryError::database)?
    .map(AssetListItem::try_from)
    .transpose()
}
```

Derive `Debug`, `Clone`, `PartialEq`, `Eq`, `Serialize`, and `Deserialize`
for both thumbnail domain types; serialize the enum as `snake_case`.

- [ ] **Step 4: Run the focused tests and format check**

Run:

```powershell
cargo test --test asset_thumbnail_repository
cargo fmt --check
```

Expected: repository tests pass and formatting exits 0.

- [ ] **Step 5: Commit and push**

```powershell
git add apps/desktop/src-tauri/src/domain apps/desktop/src-tauri/src/repositories/asset_repository.rs apps/desktop/src-tauri/tests/asset_thumbnail_repository.rs
git commit -m "feat(thumbnails): add asset lookup contract"
git push origin fix/visionhub-environment-ui
```

---

### Task 2: Validate safe thumbnail sources

**Files:**
- Modify: `apps/desktop/src-tauri/src/services/path_guard.rs`
- Create: `apps/desktop/src-tauri/src/services/asset_thumbnail_service.rs`
- Modify: `apps/desktop/src-tauri/src/services/mod.rs`
- Create: `apps/desktop/src-tauri/tests/asset_thumbnail_service.rs`

**Interfaces:**
- Consumes:
  - `AssetRepository::get(Uuid)`.
  - `EnvironmentRepository::get(Uuid)`.
  - `EnvironmentRoots.input` and `EnvironmentRoots.output`.
- Produces:

```rust
pub fn validate_allowed_file(
    path: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, PathGuardError>;

pub struct AssetThumbnailService {
    assets: AssetRepository,
    environments: EnvironmentRepository,
    cache_root: PathBuf,
}

impl AssetThumbnailService {
    pub fn new(
        assets: AssetRepository,
        environments: EnvironmentRepository,
        cache_root: PathBuf,
    ) -> Self;
}

#[derive(Debug)]
pub enum AssetThumbnailError {
    AssetNotFound(Uuid),
    Database(String),
    Cache(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathGuardError {
    Unreadable,
    NotFile,
    OutsideAllowedRoots,
}

pub async fn get_or_create(
    &self,
    asset_id: Uuid,
) -> Result<AssetThumbnail, AssetThumbnailError>;
```

- [ ] **Step 1: Write failing path and status tests**

Add tests for:

```rust
assert_eq!(
    service.get_or_create(video_id).await.unwrap().state,
    AssetThumbnailState::Unsupported
);
assert_eq!(
    service.get_or_create(missing_image_id).await.unwrap().state,
    AssetThumbnailState::Unavailable
);
assert_eq!(
    service.get_or_create(outside_root_id).await.unwrap().state,
    AssetThumbnailState::Unavailable
);
assert_eq!(
    service.get_or_create(gif_image_id).await.unwrap().state,
    AssetThumbnailState::Unsupported
);
```

Also create a file inside an allowed input root and assert
`validate_allowed_file` returns its canonical path. Create a path outside all
roots and assert validation rejects it.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
cargo test --test asset_thumbnail_service safe_
cargo test --test asset_thumbnail_service unsupported_
```

Expected: compile failure because the service and file guard do not exist.

- [ ] **Step 3: Implement validation without image generation**

`validate_allowed_file` must canonicalize every allowed root and the source
file, require `is_file()`, and compare the canonical file against at least one
canonical root using `Path::starts_with`.

`get_or_create` must:

```rust
let Some(asset) = self.assets.get(asset_id).await? else {
    return Err(AssetThumbnailError::AssetNotFound(asset_id));
};

if asset.kind != AssetKind::Image {
    return Ok(AssetThumbnail::unsupported(asset_id));
}
if asset.availability != AssetAvailability::Present {
    return Ok(AssetThumbnail::unavailable(asset_id));
}
```

Select only the environment input roots for `AssetRootKind::Input` and only
the output roots for `AssetRootKind::Output`. Models and workflows return
`Unsupported`. Check the lowercase extension against exactly:

```rust
matches!(
    extension.as_str(),
    "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tif" | "tiff"
)
```

For this task, a safely validated supported image may still return
`Unavailable`; Task 3 replaces that temporary terminal branch with actual
generation.

- [ ] **Step 4: Verify focused tests**

Run:

```powershell
cargo test --test asset_thumbnail_service
cargo fmt --check
```

Expected: source validation and media boundary tests pass.

- [ ] **Step 5: Commit and push**

```powershell
git add apps/desktop/src-tauri/src/services apps/desktop/src-tauri/tests/asset_thumbnail_service.rs
git commit -m "feat(thumbnails): validate safe image sources"
git push origin fix/visionhub-environment-ui
```

---

### Task 3: Generate, cache, invalidate, and isolate image thumbnails

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `Cargo.lock`
- Modify: `apps/desktop/src-tauri/src/services/asset_thumbnail_service.rs`
- Modify: `apps/desktop/src-tauri/tests/asset_thumbnail_service.rs`

**Interfaces:**
- Consumes: safe canonical source path from Task 2.
- Produces:

```rust
const THUMBNAIL_VERSION: &str = "v1";
const THUMBNAIL_MAX_EDGE: u32 = 640;
const MAX_IMAGE_ALLOCATION_BYTES: u64 = 256 * 1024 * 1024;

fn cache_path_for(
    cache_root: &Path,
    asset: &AssetListItem,
    source_metadata: &Metadata,
) -> Result<PathBuf, AssetThumbnailError>;

fn generate_thumbnail(
    source: &Path,
    destination: &Path,
) -> Result<(), AssetThumbnailError>;
```

- [ ] **Step 1: Add the exact image dependency**

Modify `apps/desktop/src-tauri/Cargo.toml`:

```toml
image = { version = "0.25.10", default-features = false, features = ["bmp", "jpeg", "png", "tiff", "webp"] }
```

Run:

```powershell
cargo check
```

Expected: dependency resolves with the current Rust toolchain.

- [ ] **Step 2: Write failing generation and cache tests**

Use `image::RgbImage` to create a `1200 × 800` PNG inside a temporary output
root. Record the source bytes and metadata before the request.

Assert:

```rust
let first = service.get_or_create(image_id).await.unwrap();
assert_eq!(first.state, AssetThumbnailState::Ready);
let first_path = first.cache_path.unwrap();
assert!(first_path.starts_with(cache_root.join("v1")));
assert_eq!(image::open(&first_path).unwrap().dimensions(), (640, 426));

let first_mtime = fs::metadata(&first_path).unwrap().modified().unwrap();
let second = service.get_or_create(image_id).await.unwrap();
assert_eq!(second.cache_path.as_deref(), Some(first_path.as_path()));
assert_eq!(
    fs::metadata(&first_path).unwrap().modified().unwrap(),
    first_mtime
);

assert_eq!(fs::read(&source_path).unwrap(), original_bytes);
```

Add tests for corrupt input, a supported extension with invalid bytes, and a
source image whose decoded allocation exceeds the configured limit. Each must
return `Unavailable` without leaving a final cache file.

- [ ] **Step 3: Run generation tests and verify RED**

Run:

```powershell
cargo test --test asset_thumbnail_service generates_
cargo test --test asset_thumbnail_service reuses_
```

Expected: assertions fail because supported images still return
`Unavailable`.

- [ ] **Step 4: Implement cache key and WebP generation**

Build the final path from:

```rust
format!(
    "{}-{}-{}.webp",
    asset.id.simple(),
    metadata.len(),
    modified_millis
)
```

Place it under:

```rust
cache_root
    .join(THUMBNAIL_VERSION)
    .join(&asset.id.simple().to_string()[..2])
```

Use `image::ImageReader`, apply explicit `Limits`, decode, call
`thumbnail(640, 640)`, and save with `ImageFormat::WebP`.

Write to a UUID-suffixed temporary file in the same shard directory, call
`sync_all`, then rename. If the final file appeared concurrently, discard the
temporary file and return the existing final file.

- [ ] **Step 5: Write and run invalidation/concurrency tests**

Change the source image and its file metadata, then assert the next request
returns a different final path and only one file with the asset prefix remains.

Run two `get_or_create` futures with `tokio::join!` and assert both return the
same valid path and no temporary files remain.

Run:

```powershell
cargo test --test asset_thumbnail_service
```

Expected: all service tests pass.

- [ ] **Step 6: Run Rust quality checks**

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: both exit 0.

- [ ] **Step 7: Commit and push**

```powershell
git add Cargo.lock apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/src/services/asset_thumbnail_service.rs apps/desktop/src-tauri/tests/asset_thumbnail_service.rs
git commit -m "feat(thumbnails): generate cached image previews"
git push origin fix/visionhub-environment-ui
```

---

### Task 4: Expose the cache through a minimal Tauri command

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/asset_thumbnail_commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/tauri_commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/tests/asset_thumbnail_commands.rs`

**Interfaces:**
- Consumes: `AssetThumbnailService::get_or_create`.
- Produces:

```rust
pub struct AssetThumbnailCommandService {
    service: AssetThumbnailService,
}

pub async fn get(
    &self,
    asset_id: Uuid,
) -> Result<AssetThumbnail, CommandErrorPayload>;

#[tauri::command]
pub async fn get_asset_thumbnail(
    asset_id: String,
    commands: State<'_, AssetThumbnailCommandService>,
) -> Result<AssetThumbnail, CommandErrorPayload>;
```

- [ ] **Step 1: Write failing command tests**

Assert:

```rust
let error = commands.get(Uuid::new_v4()).await.unwrap_err();
assert_eq!(error.code, "ASSET_NOT_FOUND");
assert!(!error.retryable);
```

Use a valid image fixture and assert the serialized response contains:

```json
{
  "state": "ready",
  "cache_path": "..."
}
```

- [ ] **Step 2: Run command tests and verify RED**

Run:

```powershell
cargo test --test asset_thumbnail_commands
```

Expected: compile failure because the command service is not defined.

- [ ] **Step 3: Implement error mapping and Tauri wiring**

Map service errors:

```text
AssetNotFound -> ASSET_NOT_FOUND, retryable false
Database -> THUMBNAIL_DATABASE_ERROR, retryable true
Cache -> THUMBNAIL_CACHE_ERROR, retryable true
```

In `lib.rs`, create:

```rust
let environment_commands =
    EnvironmentCommandService::new(environment_repository.clone());
let asset_query_commands =
    AssetQueryCommandService::new(asset_repository.clone());
let thumbnail_cache_root = app_data_dir.join("cache").join("thumbnails");
let thumbnail_service = AssetThumbnailService::new(
    asset_repository.clone(),
    environment_repository.clone(),
    thumbnail_cache_root,
);
let asset_thumbnail_commands =
    AssetThumbnailCommandService::new(thumbnail_service);
```

Manage the command service and add `tauri_commands::get_asset_thumbnail` to
the invoke handler.

- [ ] **Step 4: Restrict the Asset Protocol**

Update `tauri.conf.json`:

```json
"security": {
  "csp": null,
  "assetProtocol": {
    "enable": true,
    "scope": ["$APPLOCALDATA/cache/thumbnails/**/*"]
  }
}
```

- [ ] **Step 5: Verify command and configuration**

Run:

```powershell
cargo test --test asset_thumbnail_commands
cargo test --test asset_thumbnail_service
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: all focused tests and checks pass.

- [ ] **Step 6: Commit and push**

```powershell
git add apps/desktop/src-tauri/src/commands apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/tests/asset_thumbnail_commands.rs
git commit -m "feat(thumbnails): expose scoped thumbnail command"
git push origin fix/visionhub-environment-ui
```

---

### Task 5: Add the frontend thumbnail API and lazy component

**Files:**
- Create: `apps/desktop/src/features/assets/assetThumbnailApi.ts`
- Create: `apps/desktop/src/features/assets/assetThumbnailApi.test.ts`
- Create: `apps/desktop/src/features/assets/AssetThumbnail.tsx`
- Create: `apps/desktop/src/features/assets/AssetThumbnail.test.tsx`

**Interfaces:**
- Consumes: Tauri `get_asset_thumbnail(asset_id)`.
- Produces:

```ts
export type ThumbnailState = "ready" | "unsupported" | "unavailable";

export type AssetThumbnailView = {
  assetId: string;
  state: ThumbnailState;
  sourceUrl: string | null;
};

export type AssetThumbnailApi = {
  get(assetId: string): Promise<AssetThumbnailView>;
};

export type AssetThumbnailProps = {
  asset: AssetListItem;
  api?: AssetThumbnailApi;
  fallback: ReactNode;
};
```

- [ ] **Step 1: Write failing API tests**

Mock `invoke` and `convertFileSrc`, then assert:

```ts
await tauriAssetThumbnailApi.get("asset-1");

expect(invoke).toHaveBeenCalledWith("get_asset_thumbnail", {
  assetId: "asset-1"
});
expect(convertFileSrc).toHaveBeenCalledWith(
  "C:\\cache\\thumbnail.webp"
);
```

For browser preview, assert `state === "unavailable"` and
`sourceUrl === null`.

- [ ] **Step 2: Run API tests and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run src/features/assets/assetThumbnailApi.test.ts
```

Expected: module import failure.

- [ ] **Step 3: Implement the API adapter**

Map the Tauri response:

```ts
type AssetThumbnailResponse = {
  asset_id: string;
  state: ThumbnailState;
  cache_path: string | null;
};

return {
  assetId: response.asset_id,
  state: response.state,
  sourceUrl:
    response.state === "ready" && response.cache_path
      ? convertFileSrc(response.cache_path)
      : null
};
```

- [ ] **Step 4: Write failing lazy-component tests**

Provide a controllable `IntersectionObserver` test double. Assert:

- image outside the observed range does not call `api.get`;
- triggering intersection calls it once;
- a second intersect event does not call it again;
- video and audio never call it;
- ready response renders one decorative `<img alt="">`;
- rejected, unsupported, unavailable and image `error` events restore fallback;
- changing `asset.id` before the first promise resolves prevents the old URL
  from rendering.

- [ ] **Step 5: Run component tests and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run src/features/assets/AssetThumbnail.test.tsx
```

Expected: module import failure.

- [ ] **Step 6: Implement the lazy component**

Use one preview wrapper ref and:

```ts
const observer = new IntersectionObserver(
  ([entry]) => {
    if (entry?.isIntersecting) {
      setShouldLoad(true);
      observer.disconnect();
    }
  },
  { rootMargin: "160px" }
);
```

If `IntersectionObserver` is unavailable, load the visible card immediately.
Use an `active` boolean in the request effect and reset state whenever
`asset.id` changes.

- [ ] **Step 7: Verify frontend modules**

Run:

```powershell
pnpm.cmd exec vitest run src/features/assets/assetThumbnailApi.test.ts src/features/assets/AssetThumbnail.test.tsx
pnpm.cmd exec tsc -b --pretty false
```

Expected: tests and TypeScript build pass.

- [ ] **Step 8: Commit and push**

```powershell
git add apps/desktop/src/features/assets/assetThumbnailApi.ts apps/desktop/src/features/assets/assetThumbnailApi.test.ts apps/desktop/src/features/assets/AssetThumbnail.tsx apps/desktop/src/features/assets/AssetThumbnail.test.tsx
git commit -m "feat(thumbnails): add lazy preview component"
git push origin fix/visionhub-environment-ui
```

---

### Task 6: Integrate real thumbnails into asset cards

**Files:**
- Modify: `apps/desktop/src/features/assets/AssetScanPage.tsx`
- Modify: `apps/desktop/src/features/assets/AssetScanPage.test.tsx`
- Modify: `apps/desktop/src/styles/index.css`

**Interfaces:**
- Consumes: `AssetThumbnail` and `AssetThumbnailApi` from Task 5.
- Produces: image asset cards with real cached previews and unchanged
  placeholders for video/audio/failure states.

- [ ] **Step 1: Write the failing page integration test**

Render a page containing one image, one video and one audio asset. Pass a
thumbnail API mock and trigger the image observer.

Assert:

```ts
expect(thumbnailApi.get).toHaveBeenCalledTimes(1);
expect(thumbnailApi.get).toHaveBeenCalledWith(imageAsset.id);
expect(screen.getByText("preview-motion.mp4")).toBeInTheDocument();
expect(screen.getByText("soundtrack.wav")).toBeInTheDocument();
```

Also assert model and workflow labels remain absent.

- [ ] **Step 2: Run the page test and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run src/features/assets/AssetScanPage.test.tsx
```

Expected: failure because `AssetScanPage` does not accept or pass a thumbnail
API.

- [ ] **Step 3: Integrate the component**

Add:

```ts
type AssetScanPageProps = {
  assetQueryApi?: AssetQueryApi;
  thumbnailApi?: AssetThumbnailApi;
  // existing props remain unchanged
};
```

Pass `thumbnailApi` through `AssetCollection` and `AssetCard`. Replace the
current preview contents with:

```tsx
<AssetThumbnail
  api={thumbnailApi}
  asset={asset}
  fallback={
    <>
      <Icon aria-hidden="true" />
      <span>{translate(locale, assetKindLabelKey(asset.kind))}</span>
    </>
  }
/>
```

- [ ] **Step 4: Add stable preview styles**

Add rules:

```css
.asset-card__preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.asset-card__preview[data-thumbnail-state="loading"] {
  background: var(--color-surface-subtle);
}
```

Use existing tokens only. Do not add gradients, glow, overlay badges or card
height changes.

- [ ] **Step 5: Verify focused frontend tests**

Run:

```powershell
pnpm.cmd exec vitest run src/features/assets/AssetThumbnail.test.tsx src/features/assets/AssetScanPage.test.tsx
pnpm.cmd build
```

Expected: focused tests and production build pass.

- [ ] **Step 6: Commit and push**

```powershell
git add apps/desktop/src/features/assets/AssetScanPage.tsx apps/desktop/src/features/assets/AssetScanPage.test.tsx apps/desktop/src/styles/index.css
git commit -m "feat(assets): show cached image thumbnails"
git push origin fix/visionhub-environment-ui
```

---

### Task 7: Complete documentation, full verification, and desktop acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/02-技术架构与数据模型.md`
- Modify: `docs/05-路线图与验收标准.md`
- Modify: `docs/DEVELOPMENT_LOG.md`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: completed Rust, Tauri and React thumbnail flow.
- Produces: verified M2.3c milestone and a running debug application for user
  acceptance.

- [ ] **Step 1: Update milestone documentation**

Record:

- exact cache directory and supported formats;
- no FFmpeg, video poster or audio waveform;
- source directories remain read-only;
- focused and full test counts;
- actual thumbnail cache smoke evidence;
- visual screenshots and known limitations.

Mark M2.3c complete only after every command below succeeds.

- [ ] **Step 2: Run all frontend checks**

```powershell
pnpm.cmd test
pnpm.cmd build
```

Expected: all test files pass and Vite production build exits 0.

- [ ] **Step 3: Run all Rust checks**

```powershell
cargo fmt --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: all non-environment-dependent tests pass; only the existing
explicit live-environment smoke tests may remain ignored.

- [ ] **Step 4: Build the desktop application**

Stop only the running process whose executable path equals this worktree's
`target\debug\comfyneko.exe`, then run:

```powershell
pnpm.cmd exec tauri build --debug --no-bundle
```

Expected:

```text
Built application at:
...\target\debug\comfyneko.exe
```

- [ ] **Step 5: Run browser visual QA**

Use a controlled Tauri invoke mock containing image, video and audio assets.
Capture:

```text
1504 × 937 light zh-CN
1180 × 820 light zh-CN
1180 × 820 dark en-US
560 × 780 light zh-CN
320 × 700 dark en-US
240 × 700 dark en-US
```

Verify:

- real image previews keep the existing card ratio;
- video/audio remain placeholders;
- no model/workflow cards or filters;
- no document or asset-page horizontal overflow;
- loading and failed thumbnails do not shift the grid;
- browser console has 0 errors.

Save ignored evidence under:

```text
output/playwright/image-thumbnail-cache/
```

- [ ] **Step 6: Run real local desktop smoke**

Launch the debug application, select the saved company environment, open
资产管理, and confirm:

- visible PNG/JPEG cards generate real cache files;
- generated files are under
  `%LOCALAPPDATA%\com.kuroii.comfyneko\cache\thumbnails\v1\`;
- source image size, modified time and bytes remain unchanged;
- corrupt/unsupported files keep placeholders;
- scrolling lazily generates later visible rows.

Do not delete or modify any ComfyUI source file.

- [ ] **Step 7: Final diff and repository checks**

```powershell
git diff --check
git status --short
```

Expected: only intended source, test and documentation files are modified;
no cache, database, screenshot, build or user media is staged.

- [ ] **Step 8: Commit, push, and reopen**

```powershell
git add README.md docs/02-技术架构与数据模型.md docs/05-路线图与验收标准.md docs/DEVELOPMENT_LOG.md design-qa.md
git commit -m "docs(assets): complete image thumbnail milestone"
git push origin fix/visionhub-environment-ui
```

Start the newly built `target\debug\comfyneko.exe`, verify the process is
responding, and leave the window open for manual user testing.
