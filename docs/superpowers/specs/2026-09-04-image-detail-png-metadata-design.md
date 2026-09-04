# M2.4a 图片详情与 PNG 元数据设计

## 1. 目标

在现有媒体资产库中，为图片建立可选择的右侧详情检查器，并让 PNG
资产能够只读解析 ComfyUI 常见的 `prompt` 与 `workflow` 文本元数据。
该能力让用户从 output 或 input 图片快速确认生成信息，为后续可靠的
Run 关联、工作流解析和提示词提取提供受控数据基础。

本里程碑只读访问已经索引的资产。不得修改、复制、移动、重命名或删除
ComfyUI 的图片、工作流、模型、Python 环境或配置文件。

## 2. 范围

### 2.1 包含

- 在资产卡片上单击选择图片，并在资产库右侧打开详情检查器。
- 显示既有 SQLite 资产事实：名称、类型、输入/输出类别、目录、大小、
  修改时间、索引时间、在场状态。
- 仅对 `input` 或 `output` 根目录中的 `image` 资产读取 PNG 文本块。
- 提取并保存键名为 `prompt`、`workflow` 的 PNG `tEXt`、`zTXt`、`iTXt`
  内容；支持 UTF-8 与 Latin-1 可无损转译的文本。
- 在详情中显示原始 JSON 的可折叠只读视图；JSON 不合法时显示原文和
  “非 JSON 元数据”状态，不猜测字段含义。
- 每个元数据区块显示来源“PNG metadata”、解析时间与缓存状态。
- 使用 ComfyNeko SQLite 缓存解析结果，并以源文件大小与修改时间失效。
- 提供明确的未选择、加载、无嵌入元数据、文件不可用和请求失败状态。
- 中文和英文文案、亮暗主题、键盘可达性与窄窗口布局。

### 2.2 排除

- 视频、音频、GIF、JPEG、WebP、BMP、TIFF 的 metadata 解析。
- 原始图片直读、原图查看器、缩放、下载或导出。
- 对 prompt JSON 做正/负提示词、模型、采样器或 LoRA 的语义推断。
- 创建、猜测、合并或回填 `Run` 记录。
- Connector、ComfyUI API、workflow 文件和 sidecar `.txt` 读取。
- 收藏、标签、复制参数、编辑元数据或任何外部写操作。

## 3. 已确认方案

### 3.1 采用：按需只读解析 + 本地缓存 + 右侧详情检查器

点击资产卡片后，前端仅提交资产 UUID。Rust 再次读取资产、环境和允许
根目录，使用已有 `validate_allowed_file` 规范化并检查真实 PNG 路径。
后端解析文本块并把结果缓存进 ComfyNeko SQLite；同一图片未变化时直接
读取缓存，文件大小或修改时间改变后重新解析。

优点：

- 不向 WebView 暴露 ComfyUI 原始图片路径或读取权限。
- 不会把所有图片 metadata 塞进分页结果，列表仍保持轻量。
- 后续 prompt/workflow/Run 解析能基于可失效、可追溯的缓存事实继续建设。
- 右侧检查器符合既定“资产列表 + 可视详情”桌面交互规范。

### 3.2 不采用：前端直接读取 PNG 或开放 input/output 文件协议

这会扩大 WebView 的本地文件权限，还会绕开根目录验证、大小限制、错误
映射和缓存失效规则，不符合最小权限边界。

### 3.3 不采用：扫描阶段立即批量解析全部 PNG

扫描的职责是发现与索引；批量解析会显著拉长扫描任务并引入新的可取消、
恢复和资源限制需求。本阶段按用户打开详情时解析，避免影响既有扫描稳定性。

## 4. 数据与安全边界

### 4.1 数据表

新增版本化迁移 `0004_asset_png_metadata.sql`，建立 `asset_png_metadata`：

```text
asset_id             TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE
parser_version       TEXT NOT NULL
source_size_bytes    INTEGER NOT NULL
source_modified_at   TEXT NOT NULL
parse_state          TEXT NOT NULL  -- available | empty | invalid
prompt_text          TEXT NULL
workflow_text        TEXT NULL
parsed_at            TEXT NOT NULL
```

- `prompt_text` 与 `workflow_text` 保存 PNG 中的原始文本，绝不覆盖或改写。
- 缓存命中条件是 `parser_version`、文件大小与修改时间均匹配；任一不匹配
  时重新读取源文件并原子 upsert 新结果。
- `empty` 表示文件安全可读但没有两个目标块；`invalid` 表示块存在但至少
  一个无法按 JSON 解释。缺失、越界、损坏或超限的文件只返回运行时
  `unavailable` 状态，不缓存可能已恢复的失败。
- 单个字段最多 2 MiB，两个字段总计最多 4 MiB。超过上限停止读取该资产，
  返回 `unavailable`，不得把不完整内容写入数据库。

### 4.2 来源与可信度

详情响应固定包含：

```text
source: png_metadata
confidence: embedded
```

它表示数据来自图片内嵌文本，未证明它与当前环境、模型文件或工作流文件
仍然匹配。详情页面不得把它呈现为“已复现”或“已关联 Run”。

### 4.3 文件读取验证顺序

1. 解析并验证 UUID。
2. 在 SQLite 中查找资产。
3. 验证资产是 `image`、状态为 `present`、根类别为 `input` 或 `output`。
4. 读取资产所属环境和相应的已保存根目录。
5. 使用 `validate_allowed_file` 对源路径与对应根目录进行规范化验证。
6. 验证扩展名为 `.png`（大小写不敏感）。
7. 在阻塞线程读取当前文件元数据和 PNG 文本块。
8. 只在完整解析成功、空结果或明确无效结果时写入 ComfyNeko SQLite。

命令不接受源路径、环境路径、缓存路径、解析选项或大小上限等前端参数。
错误信息不得回传额外目录树、原始文件路径或 PNG 以外的本地文件内容。

## 5. Rust 架构

新增领域类型 `AssetDetail`、`AssetMetadataSource`、`AssetMetadataState` 与
`AssetPngMetadata`，全部 `serde` 使用 `snake_case`。`AssetDetail` 包含既有
`AssetListItem` 的文件事实，以及可选 `metadata`。

新增 `AssetMetadataRepository`：

```rust
pub async fn get_png_metadata(
    &self,
    asset_id: Uuid,
) -> Result<Option<CachedAssetPngMetadata>, AssetMetadataRepositoryError>;

pub async fn upsert_png_metadata(
    &self,
    record: &CachedAssetPngMetadata,
) -> Result<(), AssetMetadataRepositoryError>;
```

新增 `AssetDetailService`，依赖 `AssetRepository`、`EnvironmentRepository` 和
`AssetMetadataRepository`：

```rust
pub async fn get(&self, asset_id: Uuid) -> Result<AssetDetail, AssetDetailError>;
```

服务只从允许的 PNG 路径读取；PNG 解码使用最小 `png` crate 能力，而不是
复用图像像素解码。解析限制为元数据文本总量，且通过 `spawn_blocking` 执行，
不阻塞 Tauri 异步线程。

新增 `AssetDetailCommandService` 与命令：

```text
get_asset_detail(asset_id) -> AssetDetail
```

`ASSET_NOT_FOUND`、`INVALID_ID` 保持既有稳定错误码；数据库故障使用
`ASSET_DETAIL_DATABASE_ERROR`，解析基础设施故障使用
`ASSET_METADATA_READ_ERROR`。不支持格式、失效资产、越界路径、缺失文件、
超出 metadata 上限与损坏 PNG 以结构化详情状态返回，不让整个资产页失败。

`lib.rs` 在现有数据库初始化后构建并注册详情命令服务；
`tauri_commands.rs` 只负责 UUID 转换与服务调用。

## 6. 前端与交互

新增 `assetDetailApi.ts`，在 Tauri 运行时调用 `get_asset_detail`；浏览器预览
返回空详情状态，不伪造本地 metadata。新增 `AssetDetailInspector.tsx`，其
状态机为：

```text
unselected -> loading -> ready
                      -> unavailable
                      -> error
```

- `AssetCard` 变为语义按钮式选择项：鼠标单击、Enter、Space 可选择；当前
  选择具有清晰 focus ring 和 `aria-selected`。
- 桌面宽度下资产库主体为“目录导航 | 资产网格 | 详情检查器”；检查器 sticky
  于右侧可视区，资产网格独立滚动。
- 详情头部显示缩略图缓存预览、名称与输入/输出类别；预览仍只使用现有
  缩略图 API，不能读取原图。
- “文件信息”显示只读文件事实；“嵌入生成信息”显示 `prompt`、`workflow`
  两个可折叠区块。JSON 合法时格式化显示，非 JSON 时保留原文本，不修改。
- 无 metadata 时显示“此 PNG 未嵌入 ComfyUI prompt 或 workflow”；Run 区域
  明确显示“尚未建立关联”，不创建伪关系。
- 宽度小于 36rem 时检查器移动到网格后；小于 20rem 时所有信息区块单列，
  不产生横向滚动。
- 全部新增可见文本写入 `translate.ts` 的 `zh-CN` 与 `en-US` 资源。

## 7. 测试与验收

### 7.1 Rust

- 用临时 PNG 写入 `prompt` 和 `workflow`，验证返回、缓存和来源字段。
- 第二次读取命中缓存；源文件大小或修改时间变化后重新解析。
- 无目标块返回 `empty`；非法 JSON 返回 `invalid` 且保留原文本。
- JPEG、视频、音频、模型、工作流、失效资产、缺失文件与越界路径不读取
  任何其他文件，并返回对应受控状态。
- 超过单项或总 metadata 上限时不写入部分缓存。
- 未知 UUID、数据库错误和命令错误码保持稳定。
- 测试前后验证 PNG 源文件字节、大小和修改时间均未改变。

### 7.2 前端

- 未选择时显示说明；选择卡片后只请求一次详情。
- 选择变化时旧响应不得覆盖新选择。
- loading、empty、invalid、unavailable、error 都有可见可读反馈。
- Enter/Space 选择卡片，焦点和 `aria-selected` 同步。
- 中英文、亮暗主题以及 1366、420、320、240px 不出现横向溢出。

### 7.3 完成门槛

- 先运行新增测试并确认缺少详情接口时按预期失败。
- `pnpm.cmd --dir apps/desktop test`
- `pnpm.cmd --dir apps/desktop build`
- `cargo fmt --check`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`
- `git diff --check`
- Tauri debug `--no-bundle`；若运行中的开发版锁定目标 exe，记录原因且不
  未经用户确认关闭窗口。

## 8. 后续边界

M2.4a 完成后，下一项应为 metadata 语义解析与 Run 候选关联：仅从明确的
`prompt`、`workflow`、Connector manifest 或用户确认的 sidecar 建立关系，
每一字段继续保留来源与可信度。不得以文件名、目录或时间相近作为自动
关联依据。
