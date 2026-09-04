# M2.4a 图片详情与 PNG 元数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户能在资产库中选择 PNG 图片，安全查看其嵌入的 ComfyUI `prompt` 与 `workflow` metadata，而不读取或改写不在已绑定环境根目录内的文件。

**Architecture:** Rust 为 asset UUID 提供受控的详情查询：验证资产与环境根目录、按需解析 PNG 文本块、用源文件大小和 mtime 缓存到 SQLite。React 保留现有媒体网格，在宽屏新增 sticky 右侧详情检查器；详情使用缩略图缓存预览而不直接访问原图。Run 只显示“尚未关联”，不在本计划创建或猜测关系。

**Tech Stack:** Tauri 2、Rust、SQLx/SQLite、`flate2`、React 19、TypeScript、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-04-image-detail-png-metadata-design.md`

## Global Constraints

- 仅支持 `input` 或 `output` 根目录中、状态为 `present` 的 PNG 图片；命令只接收 UUID。
- 禁止修改、复制、移动、重命名、删除 ComfyUI 源文件或配置。
- 读取必须复用 `services::path_guard::validate_allowed_file`；不得向 WebView 返回源路径。
- PNG 单字段上限 2 MiB、两字段合计上限 4 MiB；失败不写入部分缓存。
- 所有新文案写入 `zh-CN` 和 `en-US`，并覆盖键盘、窄窗口、加载与错误状态。
- 每个任务先写失败测试、确认红灯、最小实现转绿；任务完成后更新路线图、开发日志、README 并推送 `fix/visionhub-environment-ui`。
- 不暂存或覆盖现有无关改动；GitHub 远端必须保持 `https://github.com/kuroii07/ComfyNeko.git`。

---

### Task 1: SQLite metadata 缓存与领域契约

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0004_asset_png_metadata.sql`
- Create: `apps/desktop/src-tauri/src/domain/asset_detail.rs`
- Create: `apps/desktop/src-tauri/src/repositories/asset_metadata_repository.rs`
- Modify: `apps/desktop/src-tauri/src/domain/mod.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/mod.rs`
- Modify: `apps/desktop/src-tauri/tests/database_migrations.rs`
- Test: `apps/desktop/src-tauri/tests/asset_metadata_repository.rs`

**Interfaces:**

- Consumes: `assets(id)` 与既有 `AppDatabase` 迁移入口。
- Produces: `AssetMetadataState::{Available, Empty, Invalid}`、
  `CachedAssetPngMetadata` 和 `AssetMetadataRepository::{get_png_metadata, upsert_png_metadata}`。

- [x] **Step 1: 写出失败的迁移与仓储测试**

  在 `asset_metadata_repository.rs` 使用内存数据库和已保存资产，断言：

  ```rust
  let record = CachedAssetPngMetadata::available(
      asset_id,
      2048,
      modified_at,
      Some(r#"{\"1\":{}}"#.to_owned()),
      Some(r#"{\"last_node_id\":1}"#.to_owned()),
      parsed_at,
  );
  repository.upsert_png_metadata(&record).await.unwrap();
  assert_eq!(repository.get_png_metadata(asset_id).await.unwrap(), Some(record));
  ```

  另加迁移测试：已有 `assets` 行在升级后仍存在、metadata 表存在且
  `asset_id` 外键指向 `assets(id)`。

- [x] **Step 2: 运行测试确认红灯**

  Run:

  ```powershell
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test asset_metadata_repository
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test database_migrations
  ```

  Expected: 因 migration、领域类型和仓储接口不存在而编译失败。

- [x] **Step 3: 添加最小迁移、领域与仓储实现**

  迁移创建以下列并限制缓存状态：

  ```sql
  CREATE TABLE asset_png_metadata (
      asset_id TEXT PRIMARY KEY NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      parser_version TEXT NOT NULL,
      source_size_bytes INTEGER NOT NULL,
      source_modified_at TEXT NOT NULL,
      parse_state TEXT NOT NULL CHECK (parse_state IN ('available', 'empty', 'invalid')),
      prompt_text TEXT,
      workflow_text TEXT,
      parsed_at TEXT NOT NULL
  );
  ```

  `AssetMetadataState` 使用 `#[serde(rename_all = "snake_case")]`；仓储
  只接受已完整构造的 `CachedAssetPngMetadata`，用
  `INSERT ... ON CONFLICT(asset_id) DO UPDATE` 原子覆盖同一资产的旧缓存。

- [x] **Step 4: 运行测试确认转绿并格式化**

  Run:

  ```powershell
  cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test asset_metadata_repository
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test database_migrations
  ```

  Expected: 新仓储与迁移测试通过，旧数据库升级测试仍通过。

- [x] **Step 5: 更新进度并提交推送**

  在 README、`docs/05-路线图与验收标准.md`、`docs/DEVELOPMENT_LOG.md`
  记录“缓存与领域层完成，详情命令与 UI 未完成”；仅暂存本任务文件，提交：

  ```text
  feat(metadata): add PNG metadata cache
  ```

### Task 2: 安全 PNG 解析、详情服务与 Tauri IPC

**Files:**

- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/services/asset_detail_service.rs`
- Create: `apps/desktop/src-tauri/src/commands/asset_detail_commands.rs`
- Modify: `apps/desktop/src-tauri/src/services/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/tauri_commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `apps/desktop/src-tauri/tests/asset_detail_service.rs`
- Test: `apps/desktop/src-tauri/tests/asset_detail_commands.rs`

**Interfaces:**

- Consumes: Task 1 的 `AssetMetadataRepository` 与领域 DTO，已有
  `AssetRepository`、`EnvironmentRepository`、`validate_allowed_file`。
- Produces: `AssetDetailService::get(Uuid)`、
  `AssetDetailCommandService::get(Uuid)`、`get_asset_detail(asset_id)`。

- [x] **Step 1: 写出失败的服务与命令测试**

  以临时目录生成 PNG，写入 `prompt` 和 `workflow` tEXt 块，断言：

  ```rust
  let detail = service.get(asset_id).await.unwrap();
  assert_eq!(detail.metadata.as_ref().unwrap().state, AssetMetadataState::Available);
  assert_eq!(detail.metadata.as_ref().unwrap().source, AssetMetadataSource::PngMetadata);
  assert_eq!(detail.metadata.as_ref().unwrap().prompt_text.as_deref(), Some(prompt));
  ```

  覆盖无块 `empty`、非法 JSON `invalid`、JPEG/视频 `unsupported`、失效和
  越界路径 `unavailable`、未知 UUID `ASSET_NOT_FOUND`；记录源 PNG 的字节、
  长度和 mtime，并在每个分支后保持完全相同。

- [x] **Step 2: 运行测试确认红灯**

  Run:

  ```powershell
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test asset_detail_service
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test asset_detail_commands
  ```

  Expected: 因详情服务和命令不存在而编译失败。

- [x] **Step 3: 实现受控解析与缓存失效**

  在 `Cargo.toml` 增加 `flate2 = "1"`。服务先验证资产、状态、根类别、
  环境根目录、扩展名和规范化路径；随后在 `spawn_blocking` 中读取当前
  metadata。缓存只有当 `parser_version == "v1"`、长度和 RFC3339 mtime
  均匹配时命中，否则重新解析。

  解析器必须顺序扫描 PNG chunk，仅收集键为 `prompt` 或 `workflow` 的
  `tEXt/zTXt/iTXt` 文本块，跳过像素块；累积每一字段与总字节数并在超过
  上限时立刻返回 `unavailable`，不调用 upsert。对每个收集结果使用
  `serde_json::from_str::<serde_json::Value>` 判断状态，但把原文本写入
  响应与缓存。

  注册命令时只接收 `asset_id: String`，复用既有 `parse_uuid`。命令错误映射：

  ```text
  ASSET_NOT_FOUND
  ASSET_DETAIL_DATABASE_ERROR
  ASSET_METADATA_READ_ERROR
  ```

- [x] **Step 4: 运行服务、命令和缓存回归测试确认转绿**

  Run:

  ```powershell
  cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test asset_detail_service
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test asset_detail_commands
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test asset_metadata_repository
  ```

  Expected: 所有新增与 Task 1 测试通过；同一未变化 PNG 的第二次请求命中
  SQLite 缓存，源文件变化后重新解析。

- [x] **Step 5: 更新进度并提交推送**

  更新三份项目状态文档，说明详情 IPC 已可用而前端检查器尚未完成；仅暂存
  Task 2 文件和已确认的 `Cargo.toml` 依赖变更，提交：

  ```text
  feat(assets): expose PNG metadata details
  ```

### Task 3: 资产选择、详情检查器与可访问 UI

**Files:**

- Create: `apps/desktop/src/features/assets/assetDetailApi.ts`
- Create: `apps/desktop/src/features/assets/assetDetailApi.test.ts`
- Create: `apps/desktop/src/features/assets/AssetDetailInspector.tsx`
- Create: `apps/desktop/src/features/assets/AssetDetailInspector.test.tsx`
- Modify: `apps/desktop/src/features/assets/AssetScanPage.tsx`
- Modify: `apps/desktop/src/features/assets/AssetScanPage.test.tsx`
- Modify: `apps/desktop/src/i18n/translate.ts`
- Modify: `apps/desktop/src/styles/index.css`

**Interfaces:**

- Consumes: Task 2 的 snake_case `AssetDetail` 响应与已有 `AssetThumbnailApi`。
- Produces: `AssetDetailApi.get(assetId)` 和可重用的
  `AssetDetailInspector` 组件；`AssetScanPage` 维护 `selectedAssetId`。

- [ ] **Step 1: 写出失败的 API、选择与检查器测试**

  API 测试断言 Tauri 调用精确为：

  ```ts
  invoke("get_asset_detail", { assetId: "asset-1" });
  ```

  页面测试断言单击或按 Enter 选择卡片后：卡片有 `aria-selected="true"`、
  检查器先显示 loading，再显示 prompt/workflow；快速选择第二张卡片后，
  第一张的延迟响应不得覆盖第二张。检查器测试覆盖 unselected、empty、
  invalid、unavailable、error 与英文文案。

- [ ] **Step 2: 运行前端测试确认红灯**

  Run:

  ```powershell
  pnpm.cmd --dir apps/desktop test assetDetailApi.test.ts AssetDetailInspector.test.tsx AssetScanPage.test.tsx
  ```

  Expected: 因 detail API、组件与选择状态不存在而失败。

- [ ] **Step 3: 实现最小 UI 与响应式样式**

  `assetDetailApi` 在浏览器预览返回 `null`，在 Tauri 使用
  `invoke<AssetDetail>("get_asset_detail", { assetId })`。详情检查器使用
  `Abort` 等价的请求 generation ref 忽略过期 Promise，不把错误当作列表错误。

  将卡片内部改为 `button`，保留图片缩略图与文件名，添加 `aria-selected`、
  `onClick` 与原生 Enter/Space 行为。宽屏将 `.asset-library__body` 调整为：

  ```css
  grid-template-columns: 11.5rem minmax(0, 1fr) minmax(248px, 20rem);
  ```

  检查器使用 `position: sticky; top: 0; overflow: auto;`；36rem 以下改为网格
  后的普通区块，20rem 以下单列。原始 JSON 通过 `<pre>` 显示，设定
  `overflow-wrap: anywhere`，不显示来源绝对路径。

- [ ] **Step 4: 运行前端测试与生产构建确认转绿**

  Run:

  ```powershell
  pnpm.cmd --dir apps/desktop test assetDetailApi.test.ts AssetDetailInspector.test.tsx AssetScanPage.test.tsx
  pnpm.cmd --dir apps/desktop build
  ```

  Expected: 新旧资产页测试通过，TypeScript 与 Vite 构建无错误。

- [ ] **Step 5: 更新进度并提交推送**

  更新三份项目状态文档，完整说明读写边界、详情状态与 Run 未关联事实；仅
  暂存 Task 3 文件，提交：

  ```text
  feat(assets): add PNG metadata inspector
  ```

### Task 4: 全量回归、视觉验收与里程碑交付

**Files:**

- Modify: `README.md`
- Modify: `docs/05-路线图与验收标准.md`
- Modify: `docs/DEVELOPMENT_LOG.md`
- Modify: `docs/superpowers/plans/2026-09-04-image-detail-png-metadata.md`

**Interfaces:**

- Consumes: Tasks 1–3 的完整详情链路。
- Produces: 标记完成的 M2.4a 路线图、可复现验证记录和已推送里程碑提交。

- [ ] **Step 1: 运行完整质量门槛**

  Run:

  ```powershell
  pnpm.cmd --dir apps/desktop test
  pnpm.cmd --dir apps/desktop build
  cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
  cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
  git diff --check
  ```

  Expected: 全部通过；真实环境依赖的现有 smoke 若因环境变量缺失被忽略，
  必须如实记录。

- [ ] **Step 2: 执行桌面视觉验收**

  在开发版中检查中文亮色、英文暗色和 1366、420、320、240px：选择 PNG
  后详情可见；切换卡片不闪回旧详情；prompt/workflow 长 JSON 无横向溢出；
  未选择、无 metadata、不可用和错误状态可理解。若运行中的 exe 锁定独立
  Tauri debug 构建目标，记录 Windows 错误并保留窗口，不强行终止。

- [ ] **Step 3: 完成文档与路线图**

  README 说明图片详情和 PNG metadata 的范围；路线图把 M2.4a 用
  `~~删除线~~` 标为完成；开发日志记录红绿测试、完整验证、真实桌面验收、
  已知限制和“尚未建立 Run 关联”。本计划四个任务的复选框全部改为 `[x]`。

- [ ] **Step 4: 审查提交范围并推送**

  Run:

  ```powershell
  git remote get-url origin
  git fetch origin
  git diff --check
  git status --short
  ```

  确认远端仍为 `https://github.com/kuroii07/ComfyNeko.git`，仅暂存本里程碑
  源码、测试和文档；不提交数据库、PNG 样本、缩略图缓存、`target/`、
  `node_modules/` 或无关改动。提交：

  ```text
  docs(assets): complete PNG metadata detail milestone
  ```

  然后推送 `fix/visionhub-environment-ui`。
