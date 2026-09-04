# M2.3c 图片缩略图与受控缓存设计

## 1. 目标

为 ComfyNeko 媒体资产库接入真实图片缩略图。缩略图由 Rust Core
按需生成，只写入 ComfyNeko 自己的应用数据缓存，不修改、覆盖或复制
用户的 ComfyUI 源文件。

本里程碑优先解决图片浏览体验。视频继续显示视频类型占位，音频继续显示
音频类型占位；视频封面和音频波形等待后续独立里程碑，不在本次引入
FFmpeg 或其他外部媒体运行时。

## 2. 已确认方案

### 2.1 包含

- 图片资产的真实缩略图生成与显示。
- `app_local_data_dir()/cache/thumbnails/v1/` 受控缓存目录。
- 只接收资产 ID 的 Tauri 查询命令。
- 后端重新验证资产、环境、媒体类型、在场状态和允许根目录。
- 可见卡片懒加载，不一次生成当前分页的全部缩略图。
- 缓存命中、源文件变化自动失效和同资产旧版本清理。
- 缩略图缺失、损坏、格式不支持或生成失败时回退现有类型占位。
- 亮暗主题、中英文和 240/320/420/1180/1504px 视觉验收。

### 2.2 首版支持格式

- PNG
- JPEG / JPG
- WebP
- BMP
- TIFF / TIF

GIF、AVIF 和其他已被扫描器归为图片、但首版解码链路未明确支持的格式，
继续显示图片占位，不影响资产查询和列表。

### 2.3 排除

- 视频首帧或封面提取。
- 音频波形、封面和时长解析。
- PNG prompt/workflow metadata。
- 原图查看器、缩放、对比和详情面板。
- 全局缓存容量上限、定时清理和设置页“清空缓存”。
- 将 ComfyUI 输入或输出根目录暴露给 WebView。
- 将缩略图二进制批量塞入资产分页响应。
- 数据库迁移或新增缩略图表。

## 3. 方案比较

### 3.1 采用：Rust 生成文件 + Tauri 受限 Asset Protocol

Rust 按需生成缓存文件，前端收到缓存路径后使用 Tauri 的受限
Asset Protocol 显示。协议范围只允许访问
`$APPLOCALDATA/cache/thumbnails/**/*`。

优点：

- 原始 ComfyUI 目录不暴露给 WebView。
- 图片二进制不经过普通 JSON IPC。
- 浏览器可直接使用 `<img>` 的解码、布局和失败回退能力。
- 缓存文件可重建，不需要数据库事务管理。

### 3.2 不采用：Tauri 命令返回 Base64 或整块字节

该方案实现直接，但分页中多个缩略图会增加 IPC 序列化、内存复制和前端
对象 URL 生命周期管理成本，不适合作为长期资产网格方案。

### 3.3 不采用：直接开放 ComfyUI 源目录给 WebView

该方案省去缓存生成，但会扩大 WebView 的本地文件访问范围，也无法统一
尺寸、格式、损坏隔离和后续缓存治理，不符合本地优先工具的最小权限边界。

## 4. 缓存目录与身份

缓存根目录：

```text
app_local_data_dir()/
  cache/
    thumbnails/
      v1/
        ab/
          <asset-id>-<size>-<mtime>.webp
```

- `v1` 是缩略图算法与输出格式版本。未来改变尺寸、编码或裁切策略时升级
  版本目录，不覆盖旧算法文件。
- `ab` 使用资产 UUID 前两个十六进制字符分片，避免单目录文件过多。
- 文件名包含资产 ID、当前源文件大小和修改时间戳。
- 修改时间不可用时使用当前资产 `indexed_at`，避免产生无版本标识文件。
- 源文件大小或修改时间变化后会得到新文件名，旧缓存不会被错误复用。
- 新缓存成功，只清理同分片目录中同一资产 ID 的其他缩略图版本。
- 清理范围严格限制在缓存根目录内，永不把源文件作为删除目标。

本里程碑不把绝对缓存路径或缩略图状态写入 SQLite。资产事实仍由
`assets` 表负责，缩略图完全可重建。

## 5. 安全读取边界

前端命令只传：

```text
asset_id
```

后端必须依次验证：

1. ID 是合法 UUID。
2. 资产存在。
3. 资产类型是 `image`。
4. 资产状态是 `present`。
5. 根类别是 `input` 或 `output`。
6. 对应环境档案存在。
7. 源路径和允许根目录经过 Windows 安全规范化。
8. 规范化源路径位于该环境已保存的对应输入或输出根目录内。
9. 源路径是普通文件，不是目录。
10. 缓存目标路径仍位于受控缓存根目录内。

命令不得接受任意源路径、任意缓存路径、输出尺寸或编码参数。首版固定
缩略图规则，避免前端借查询命令读取其他本地文件或制造无限缓存变体。

## 6. Rust 服务边界

新增 `AssetThumbnailService`，核心依赖：

- `AssetRepository`：按资产 ID 读取完整资产事实。
- `EnvironmentRepository`：读取该资产所属环境和允许根目录。
- `PathBuf cache_root`：由 Tauri setup 传入受控缓存根目录。
- 图片解码器：Rust `image` crate。

核心接口：

```rust
pub async fn get_or_create(
    &self,
    asset_id: Uuid,
) -> Result<AssetThumbnail, AssetThumbnailError>
```

返回：

```text
asset_id
state: ready | unsupported | unavailable
cache_path: PathBuf | null
```

- `ready`：缓存命中或成功生成。
- `unsupported`：不是图片，或扩展名不在首版支持范围。
- `unavailable`：源文件已不存在、不是普通文件、无法安全验证或图片损坏。
- 数据库不可用、缓存目录不可写等基础设施问题使用结构化命令错误。

`unsupported` 和单文件 `unavailable` 是可预期的卡片状态，不得导致整个
资产列表报错。

## 7. 生成流程

1. 查询并验证资产和环境。
2. 在阻塞线程中读取当前文件元数据，生成缓存键。
3. 缓存文件已存在时直接返回。
4. 使用显式解码内存上限读取源图片。
5. 按最长边不超过 640px 等比缩放，不放大小图。
6. 编码为 WebP 缓存文件。
7. 在目标目录创建唯一临时文件。
8. 完整写入并刷新后，在同一目录原子重命名为最终文件。
9. 并发请求已生成同一最终文件时，复用现有文件并删除自己的临时文件。
10. 成功后清理同资产旧缓存版本。

图片解码和缩放必须通过 `spawn_blocking` 执行，不占用异步命令执行线程。
单个损坏或过大的图片只返回该卡片不可用，不影响其他缩略图。

## 8. Tauri 配置与 IPC

新增命令：

```text
get_asset_thumbnail(asset_id) -> AssetThumbnail
```

新增安全配置：

```text
assetProtocol.enable = true
assetProtocol.scope = ["$APPLOCALDATA/cache/thumbnails/**/*"]
```

前端 `thumbnailApi`：

- Tauri 环境调用 `get_asset_thumbnail`。
- 浏览器预览返回等价空结果，不伪造本地文件。
- `ready` 状态通过 `convertFileSrc(cache_path)` 得到 `<img src>`。

Asset Protocol 不允许访问数据库、日志、环境配置或绑定的 ComfyUI 目录。

## 9. 前端懒加载与卡片状态

图片卡片增加四个内部状态：

```text
idle -> loading -> ready
                -> fallback
```

- `IntersectionObserver` 在卡片进入视口前约 160px 时触发请求。
- 未进入视口的卡片不调用 Tauri。
- 视频和音频卡片不调用缩略图命令。
- `loading` 保留固定预览尺寸，使用克制骨架反馈，避免网格跳动。
- `ready` 使用 `object-fit: cover` 显示真实缩略图。
- `fallback` 保留当前类型图标和类型文字。
- `<img alt="">`，文件名仍由卡片正文提供，避免屏幕阅读器重复朗读。
- 图片加载事件失败时切回占位，不把内部缓存路径显示给用户。

搜索、媒体筛选、目录筛选和分页切换后，卸载的卡片必须丢弃旧响应，不能
把上一页缩略图写入新的卡片状态。

## 10. 错误码

- `INVALID_ID`
- `ASSET_NOT_FOUND`
- `THUMBNAIL_DATABASE_ERROR`
- `THUMBNAIL_CACHE_ERROR`

以下情况不作为命令错误：

- 资产不是首版支持图片。
- 资产已失效或源文件不存在。
- 路径不在当前保存的环境根目录内。
- 图片损坏、解码超限或无法生成缩略图。

这些情况返回 `unsupported` 或 `unavailable`，前端回退占位图。

错误消息不得包含环境完整目录树。单个资产的已有路径只用于后端验证，
不新增日志或错误中的路径泄露。

## 11. 测试策略

### 11.1 Rust 单元与集成测试

- 图片资产首次请求生成 WebP 缓存。
- 第二次请求命中同一缓存，不重写文件。
- 源文件大小或修改时间改变后生成新版本。
- 新版本成功后只清理同资产旧缓存。
- 视频、音频、模型和工作流返回 `unsupported`。
- 失效资产、缺失文件、损坏图片和超限图片返回 `unavailable`。
- 任意伪造资产 ID 或越界路径不能读取文件。
- 输入和输出根目录均可安全生成。
- 同一缩略图并发请求最终只保留一个有效文件。
- 测试前后源文件字节与元数据不变。

测试使用临时目录和测试生成的图片，不读取或修改真实 ComfyUI 文件。

### 11.2 前端测试

- 图片卡片进入观察范围后只请求一次缩略图。
- 未进入观察范围不请求。
- 视频和音频不请求。
- `ready` 显示图片并保留文件名。
- `unsupported`、`unavailable`、命令错误和 `<img>` 加载失败均回退占位。
- 快速分页或筛选后旧响应不覆盖新卡片。
- 浏览器预览继续稳定显示占位。

### 11.3 全量门禁

- `pnpm.cmd test`
- `pnpm.cmd build`
- `cargo fmt --check`
- `cargo test --workspace`
- `cargo clippy --workspace --all-targets -- -D warnings`
- Tauri debug `--no-bundle`
- `git diff --check`
- Playwright 亮暗、中英文和目标窗口宽度检查。
- 最新 debug 程序真实启动，交给用户手动验收。

## 12. 交付与后续

本里程碑提交：

- Rust 缩略图服务、仓储读取、Tauri 命令和测试。
- `image` 依赖与最小 Asset Protocol 安全配置。
- 前端懒加载 API、卡片状态、样式和测试。
- README、路线图、开发日志和视觉验收记录。

不提交：

- 真实缩略图缓存。
- 用户数据库或媒体文件。
- 构建目录和安装包。

后续顺序：

1. 视频封面提取方案与 FFmpeg 运行时边界。
2. 音频波形和封面缓存。
3. 缓存容量统计、上限、手动清理和孤儿缓存回收。
4. 媒体详情页与原图查看器。
