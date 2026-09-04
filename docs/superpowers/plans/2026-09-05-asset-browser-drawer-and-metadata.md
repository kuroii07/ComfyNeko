# M2.4b 资产浏览器、详情抽屉与可读 Metadata 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将资产页从常驻三栏大卡片重构为高密度多列图库、按需详情抽屉、可读生成参数和受控大图预览。

**Architecture:** 保留现有 Rust 资产查询、缩略图和 PNG metadata IPC；前端把浏览、详情抽屉和预览弹窗拆成边界清晰的组件。详情只在选中时显示，长 JSON 作为高级回退；大图通过新增 UUID-only 预览缓存命令提供，不暴露 ComfyUI 源路径。

**Tech Stack:** Tauri 2、React 19、TypeScript、Vitest、Rust、SQLite、现有 WebP 缩略图管线。

**Spec:** `docs/superpowers/specs/2026-09-05-asset-browser-drawer-and-metadata-design.md`

## Global Constraints

- 默认浏览状态必须在 1366px 显示至少 3 列图片卡片；详情打开后仍至少保留 2 列。
- 详情抽屉默认关闭，单击、Enter 或 Space 选择资产后打开；Esc/关闭按钮返回浏览状态。
- PNG metadata 只读，所有摘要字段标记 `source=png_metadata` 与 embedded 可信度；不猜测 Run 关系。
- 不修改、复制、移动、重命名或删除 ComfyUI 文件，不向 WebView 返回源路径。
- 所有新文案进入 `zh-CN` 与 `en-US`；支持 1366/420/320/240px 且无页面级横向溢出。
- 每项任务先写失败测试并确认红灯，再实现最小代码转绿；完成后更新 README、路线图、开发日志。
- GitHub 远端保持 `https://github.com/kuroii07/ComfyNeko.git`；不提交真实媒体、缓存、数据库或构建目录。

---

### Task 1: 浏览器布局与详情抽屉

**Files:**

- Create: `apps/desktop/src/features/assets/AssetBrowserLayout.tsx`
- Create: `apps/desktop/src/features/assets/AssetBrowserLayout.test.tsx`
- Modify: `apps/desktop/src/features/assets/AssetScanPage.tsx`
- Modify: `apps/desktop/src/features/assets/AssetScanPage.test.tsx`
- Modify: `apps/desktop/src/features/assets/AssetDetailInspector.tsx`
- Modify: `apps/desktop/src/styles/index.css`
- Modify: `apps/desktop/src/i18n/translate.ts`

**Interfaces:**

- Consumes: `AssetPage`, `AssetThumbnailApi`, `AssetDetailApi`, existing scan/query state.
- Produces: `AssetBrowserLayout` with `selectedAssetId`, `onSelect`, `onCloseDetail` and a conditional detail drawer; `AssetCard` remains keyboard-selectable.

  - [x] **Step 1: Write failing tests**

  Add tests that assert the initial page has no detail drawer and renders two test images as separate selectable cards; selecting one opens a drawer with a close button; pressing Escape closes it; selecting a second card keeps the first request from replacing the second detail.

  - [x] **Step 2: Run red tests**

  ```powershell
  pnpm.cmd --dir apps/desktop test AssetBrowserLayout.test.tsx AssetScanPage.test.tsx
  ```

  Expected: failure because the drawer is currently always rendered as a third grid column and there is no close interaction.

  - [x] **Step 3: Implement minimum layout**

  Move the current collection rendering into `AssetBrowserLayout`; make the detail drawer conditional on `selectedAssetId`; add a close button with translated label, an Escape listener scoped to an open drawer, and preserve request-generation protection. Use `grid-template-columns: var(--asset-category-width) minmax(0, 1fr)` for the base page and place the drawer as an overlay/push panel that leaves the grid at least two columns at desktop widths. At `<760px`, use a full-width bottom sheet.

  - [x] **Step 4: Run green tests and build**

  ```powershell
  pnpm.cmd --dir apps/desktop test AssetBrowserLayout.test.tsx AssetScanPage.test.tsx
  pnpm.cmd --dir apps/desktop build
  ```

  - [ ] **Step 5: Commit**

  ```powershell
  git add apps/desktop/src/features/assets/AssetBrowserLayout.tsx apps/desktop/src/features/assets/AssetBrowserLayout.test.tsx apps/desktop/src/features/assets/AssetScanPage.tsx apps/desktop/src/features/assets/AssetScanPage.test.tsx apps/desktop/src/features/assets/AssetDetailInspector.tsx apps/desktop/src/styles/index.css apps/desktop/src/i18n/translate.ts
  git commit -m "feat(assets): add drawer-based asset browser"
  ```

### Task 2: 可读 ComfyUI metadata 摘要

**Files:**

- Create: `apps/desktop/src/features/assets/comfyMetadataSummary.ts`
- Create: `apps/desktop/src/features/assets/comfyMetadataSummary.test.ts`
- Modify: `apps/desktop/src/features/assets/AssetDetailInspector.tsx`
- Modify: `apps/desktop/src/features/assets/AssetDetailInspector.test.tsx`
- Modify: `apps/desktop/src/i18n/translate.ts`

**Interfaces:**

- Consumes: `AssetDetailMetadata.prompt_text` and `workflow_text` strings returned by the existing detail API.
- Produces: `summarizeComfyPrompt(promptText): ComfyMetadataSummary` with `positivePrompt`, `negativePrompt`, `model`, `sampler`, `scheduler`, `steps`, `cfg`, `seed`, `denoise`, `width`, `height`, and per-field `source/confidence`.

  - [x] **Step 1: Write failing summary tests**

  Use literal fixtures for a `CheckpointLoaderSimple`, two `CLIPTextEncode` nodes, `KSampler`, and `EmptyLatentImage`; assert positive/negative text and parameters. Add tests for missing links, unknown node classes, and invalid JSON returning an empty summary without throwing.

  - [x] **Step 2: Run red tests**

  ```powershell
  pnpm.cmd --dir apps/desktop test comfyMetadataSummary.test.ts
  ```

  - [x] **Step 3: Implement bounded parser**

  Parse only JSON objects already supplied by the detail IPC. Walk known node classes and link arrays; never read files or infer values from names/paths. If a field cannot be traced, return `null` with `unresolved` state. Keep raw prompt/workflow inside collapsed “高级数据” blocks.

  - [x] **Step 4: Integrate and verify**

  Update the drawer to show prompt/negative prompt and a compact parameter grid before raw JSON. Add source badges and translated empty/unresolved labels. Run:

  ```powershell
  pnpm.cmd --dir apps/desktop test comfyMetadataSummary.test.ts AssetDetailInspector.test.tsx AssetScanPage.test.tsx
  pnpm.cmd --dir apps/desktop build
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add apps/desktop/src/features/assets/comfyMetadataSummary.ts apps/desktop/src/features/assets/comfyMetadataSummary.test.ts apps/desktop/src/features/assets/AssetDetailInspector.tsx apps/desktop/src/features/assets/AssetDetailInspector.test.tsx apps/desktop/src/i18n/translate.ts
  git commit -m "feat(assets): summarize comfyui metadata"
  ```

### Task 3: 受控大图预览与弹窗

**Files:**

- Create: `apps/desktop/src-tauri/src/services/asset_preview_service.rs`
- Create: `apps/desktop/src-tauri/src/commands/asset_preview_commands.rs`
- Create: `apps/desktop/src-tauri/tests/asset_preview_service.rs`
- Create: `apps/desktop/src/tauri/tests/asset_preview_commands.rs`
- Create: `apps/desktop/src/features/assets/assetPreviewApi.ts`
- Create: `apps/desktop/src/features/assets/AssetPreviewDialog.tsx`
- Create: `apps/desktop/src/features/assets/AssetPreviewDialog.test.tsx`
- Modify: `apps/desktop/src-tauri/src/services/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/tauri_commands.rs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src/features/assets/AssetDetailInspector.tsx`
- Modify: `apps/desktop/src/features/assets/AssetScanPage.tsx`
- Modify: `apps/desktop/src/styles/index.css`

**Interfaces:**

- Consumes: existing asset UUID validation, path guard, thumbnail cache patterns, `AssetDetail`.
- Produces: `get_asset_preview(asset_id) -> AssetPreviewResponse` and `AssetPreviewDialog` with focus return and Escape close.

  - [x] **Step 1: Write failing Rust and UI tests**

  Rust tests must prove UUID-only requests, input/output whitelist enforcement, cache hit/mtime invalidation, max edge 2048px, source bytes unchanged, and no source path in the response. UI tests must prove dialog role, close button focus, Escape close, and fallback states.

  - [x] **Step 2: Run red tests**

  ```powershell
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test asset_preview_service --test asset_preview_commands
  pnpm.cmd --dir apps/desktop test AssetPreviewDialog.test.tsx
  ```

  - [x] **Step 3: Implement cache and commands**

  Reuse the thumbnail service's safe path validation and atomic cache write pattern, but write to `cache/previews/v1/`, resize longest edge to 2048px, and expose only the cache protocol scope. Map unknown IDs and database failures to stable command errors; return `unsupported` or `unavailable` for media that cannot be previewed.

  - [x] **Step 4: Integrate dialog and verify**

  Add an “放大预览” action in the drawer; keep the summary visible beside the image on desktop and stack it on narrow widths. Run the full frontend and Rust quality gates.

- [ ] **Step 5: Commit**

  ```powershell
  git add apps/desktop/src-tauri apps/desktop/src/features/assets apps/desktop/src/styles/index.css
  git commit -m "feat(assets): add controlled full preview"
  ```

### Task 4: 文档、视觉验收与推送

**Files:**

- Modify: `README.md`
- Modify: `docs/05-路线图与验收标准.md`
- Modify: `docs/DEVELOPMENT_LOG.md`
- Modify: `docs/superpowers/specs/2026-09-05-asset-browser-drawer-and-metadata-design.md`
- Modify: this plan file

- [ ] **Step 1: Run complete quality gates**

  ```powershell
  pnpm.cmd --dir apps/desktop test
  pnpm.cmd --dir apps/desktop build
  cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
  cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
  git diff --check
  ```

- [ ] **Step 2: Verify desktop visuals**

  Check Chinese light and English dark themes at 1366/420/320/240px: default multi-column gallery, drawer open/close, second selection, raw JSON wrapping, metadata empty/error states, preview dialog focus and Escape behavior. Do not close a running user window solely to rebuild it.

- [ ] **Step 3: Update project status**

  Mark M2.4b complete with `~~strikethrough~~` in the roadmap, record the exact red/green test evidence and the known limitation that Run relationships remain uncreated.

- [ ] **Step 4: Verify remote, commit and push**

  ```powershell
  git remote get-url origin
  git fetch origin
  git diff --check
  git status --short
  git add README.md docs/05-路线图与验收标准.md docs/DEVELOPMENT_LOG.md docs/superpowers/specs/2026-09-05-asset-browser-drawer-and-metadata-design.md docs/superpowers/plans/2026-09-05-asset-browser-drawer-and-metadata.md
  git commit -m "docs(assets): complete asset browser redesign"
  git push origin fix/visionhub-environment-ui
  ```
