# M2.4b 资产浏览器、详情抽屉与可读 Metadata 设计

## 1. 背景与决策

ComfyNeko 当前的 M2.4a 详情实现把检查器作为资产网格的第三个常驻列，并在详情中优先展示原始 JSON。真实 Windows 窗口在应用侧栏、目录栏和检查器同时占宽后，媒体网格只能渲染一列大卡片。这不符合专业资产浏览器的核心任务：快速连续地查看大量生成结果。

本设计参考 ComfyNexus 的信息层级与交互节奏，但不复制其代码、文案或写操作。目标是让 ComfyNeko 保持自己的本地只读、安全路径与 Run 关联边界，同时形成：

```text
默认多列资产浏览 -> 单击选择 -> 右侧详情抽屉 -> 沉浸式预览与参数阅读
```

## 2. 目标与非目标

### 2.1 目标

1. 在 1366px 桌面窗口中，未选中资产时显示至少 3 列图片卡片；打开详情后仍至少显示 2 列完整卡片，不得退化为单列大图。
2. 详情抽屉默认关闭，单击、Enter 或 Space 选择一张资产才打开；Esc 或关闭按钮可关闭并返回纯浏览状态。
3. 详情先提供缩略图、文件事实与结构化生成摘要；`prompt`、`workflow` 原文只在“高级数据”中按需展开。
4. 对合法 ComfyUI `prompt` JSON，展示可读的正向/反向提示词、模型、Sampler、Scheduler、Steps、CFG、Seed、Denoise 与尺寸；每个区块说明数据来自 PNG metadata，不宣称已经复现或建立 Run 关联。
5. 为大图查看提供受控预览弹窗。弹窗只使用 ComfyNeko 本地预览缓存，不向 WebView 暴露 ComfyUI 源文件路径或可直接读取源文件的 URL。
6. 支持中文、英文、亮/暗主题与 1366、420、320、240px 宽度；无页面级横向滚动。

### 2.2 非目标

- 不写入、移动、删除、重命名或复制 ComfyUI 媒体文件。
- 不在本阶段实现收藏、标签、评分、备注或批量删除；这些是后续受确认的写能力。
- 不根据文件名、时间、目录或 JSON 猜测 Run 关联。
- 不尝试支持所有第三方自定义节点的参数语义；无法可靠识别时保留原文并明确提示。

## 3. 体验与布局

### 3.1 视觉读法

这是面向高频创作回看的 Windows 本地 AIGC 素材浏览器，而不是设置面板或代码检查器。设计变化度为 4/10、动效强度为 3/10、信息密度为 7/10。视觉应使用现有 ComfyNeko token 和 Lucide 图标，保持冷静、清晰、可扫描；禁止玻璃拟态、无意义渐变、固定大卡片或把 JSON 当作首屏内容。

### 3.2 默认浏览状态

资产页不再把详情检查器放进常驻 CSS Grid 列。主体保持：

```text
目录导航（约 14rem） | 可独立滚动的媒体网格（剩余宽度）
```

- 顶栏继续承载环境、搜索、扫描、排序与在场状态；不增加重复的大标题。
- 中央图片网格使用 `minmax(190px, 1fr)` 到 `minmax(220px, 1fr)` 的自适应列，使 1366px 常规窗口至少可显示三列，较宽窗口自然增加列数。
- 卡片保持 4:3 缩略图和紧凑的文件名/大小/根类别，不以纵向原图比例撑高网格。
- 左侧目录只显示全部、输入素材、生成结果；收藏、分类等功能在数据能力就绪后再显示，避免不可用入口。

### 3.3 选择与详情抽屉

选中资产后，右侧打开宽度 `clamp(20rem, 25vw, 24rem)` 的详情抽屉。抽屉在视觉上从右侧进入，具备关闭按钮和明确的选中卡片描边；资产网格的列宽调整上限为保持至少两列，而不是被抽屉挤成一列。抽屉关闭后立即还原全部浏览宽度。

详情顺序如下：

1. 头部：缓存缩略图、文件名、输入/输出来源与关闭按钮。
2. 文件事实：尺寸、格式、文件大小、修改时间；缺失值显示“未知”。
3. 生成摘要：来源徽标 `PNG metadata`，按折叠区展示正向提示词、反向提示词和生成参数。不完整、非法或无法解析的字段显示原因，而非显示空白成功态。
4. 高级数据：`prompt`、`workflow` 原文以独立 `<details>` 展示，长 JSON 在抽屉内换行与纵向滚动，绝不产生横向页面滚动。
5. Run：明确显示“尚未建立 Run 关联”。

详情抽屉只处理单选。Ctrl/Shift 多选、右键菜单和批量写操作在资产写能力设计时单独落地；本阶段不伪造 Windows 批量操作。

### 3.4 沉浸式预览

详情头部的“放大预览”打开 `role="dialog"` 的预览层：左侧显示受控预览图，右侧复用生成摘要；Esc、关闭按钮和遮罩点击关闭，焦点被限制在弹窗内并在关闭后返回原卡片。弹窗不提供删除、导出或写入操作。

为避免把源图直通 WebView，新增受控预览缓存服务。它只接收资产 UUID，在 Rust 端重新验证 present image、input/output 根目录和规范化路径后，生成最长边 2048px 的 WebP 至 `cache/previews/v1/`；Asset Protocol 只暴露该缓存目录。源图未改变时复用缓存，源文件大小/mtime 改变时重新生成。该服务与现有 640px 缩略图缓存分开，不影响滚动时的缩略图懒加载。

### 3.5 响应式规则

- `>= 1180px`：目录 + 网格；详情为右侧抽屉，网格保持至少两列。
- `760px–1179px`：目录可缩窄；详情以遮罩式抽屉覆盖右侧，避免压缩网格。
- `< 760px`：目录变为横向筛选条；详情为全宽底部 sheet，预览弹窗单列。
- `320px/240px`：工具栏、筛选与抽屉内部单列；任何路径、JSON、英文名称都使用 `min-width: 0`、换行或省略策略。

## 4. 数据与组件边界

### 4.1 前端模块

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `AssetBrowserLayout` | 浏览区、抽屉开关、响应式布局 | 解析 PNG、生成预览 |
| `AssetGrid` / `AssetCard` | 卡片渲染、单选语义、缩略图懒加载 | 详情请求状态 |
| `AssetDetailDrawer` | 文件事实、metadata 摘要、高级原文、关闭 | 直接访问文件路径 |
| `comfyMetadataSummary` | 从已返回的 JSON 提取可信字段 | 识别未知自定义节点或建立 Run |
| `AssetPreviewDialog` | 焦点管理、受控预览显示、Esc 关闭 | 源图访问、写操作 |
| `assetPreviewApi` | UUID 到受控预览缓存协议 URL | 文件系统路径拼接 |

`AssetScanPage` 现有扫描、环境、搜索、分页状态应拆出或收敛，避免继续把扫描轮询、查询、卡片、详情和预览都堆在同一组件内。

### 4.2 Metadata 语义摘要

`comfyMetadataSummary` 只在浏览器端处理已经由 Rust 安全读取并返回的 `prompt_text`。它先验证 JSON 为对象，再按 ComfyUI 常见节点类型读取：

- `CLIPTextEncode`：`text`，按与 KSampler 的正/负输入链优先级标为正向或反向。
- `CheckpointLoaderSimple` / 可识别模型加载节点：checkpoint 名称。
- `KSampler` / `KSamplerAdvanced`：seed、steps、cfg、sampler_name、scheduler、denoise。
- `EmptyLatentImage` / 已知尺寸字段：width、height。

所有摘要字段是“尽力而为”的 embedded 数据：

```text
value + source=png_metadata + confidence=embedded
```

链路缺失、节点未知、值为引用或 JSON 无效时，摘要显示“未从嵌入数据中识别”，并把原文留在高级数据中。前端不持久化或修改任何 metadata。

### 4.3 Rust 预览服务

新增 `AssetPreviewService`、`AssetPreviewCommandService` 与 `get_asset_preview(asset_id)`；其路径验证、锁、原子写入、缓存失效和错误码应复用缩略图服务的经过验证的模式，但单独命名缓存版本和最大边长。允许的响应状态：

```text
ready | unsupported | unavailable
```

命令不接收路径、尺寸或任意缓存名称。未知 UUID、无效 UUID 和数据库错误继续使用明确稳定的 command error。预览生成失败不得影响卡片列表或详情 metadata。

## 5. 状态、可访问性与安全

- 选择：卡片为 `role="option"`，容器为 `role="listbox"`，使用 `aria-selected`、明显 focus ring 与 Enter/Space 选择。
- 抽屉：加载、无 metadata、invalid、unsupported、unavailable、error 均有可读状态；请求 generation 保证旧响应不会覆盖新选择。
- 弹窗：`role="dialog" aria-modal="true"`，打开后聚焦关闭按钮，Tab 循环，Esc 关闭，关闭后返回触发卡片。
- 动效：抽屉与弹窗仅使用短暂 opacity/translate，尊重 `prefers-reduced-motion`。
- 所有用户可见文本进入中英翻译资源；英文使用短标签，避免撑破标签或按钮。
- 所有读取继续受 Rust 路径白名单保护；UI 绝不显示 `normalized_path` 或可用于读取源文件的 URL。

## 6. 实施顺序与测试

### M2.4a 收尾

先完成当前已存在的详情 API、缓存与基础选择测试的归档验证；不把尚未完成的常驻三栏 UI 作为最终视觉验收通过项。

### M2.4b.1 浏览与抽屉重构

先写失败测试：默认无抽屉时的多列布局语义、选择后抽屉打开、Esc/关闭按钮、选中态以及旧请求不覆盖新选择。实现组件拆分和响应式 CSS，再验证亮暗、中英与窄宽度。

### M2.4b.2 可读 metadata 摘要

先对手工构造的 ComfyUI prompt JSON 写单元测试，覆盖正常摘要、引用链、缺字段、未知自定义节点和非法 JSON；再接入详情抽屉。高级 JSON 是回退展示而非主界面。

### M2.4b.3 受控大图预览

先为预览缓存写 Rust 失败测试，验证 UUID-only 命令、白名单、缓存命中/失效、尺寸上限、源文件不变与协议 URL 不泄露源路径；再写弹窗焦点、Esc、关闭和状态测试。

### 完成门槛

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
git diff --check
```

真实桌面验收必须覆盖中文亮色、英文暗色、1366px、420px、320px、240px，以及：默认多列、打开/关闭详情、切换资产、无 metadata、非法 metadata、长 JSON 和预览弹窗。运行中的开发窗口锁定 debug exe 时，记录而不强制关闭。

## 7. 后续边界

收藏、标签、评分、备注、回收站、复制参数、导出工作流和 Run 关联应各自建立数据模型、ChangePlan 或来源可信度规格后再实现。本设计不因参考软件存在这些按钮，就在只读 MVP 中加入危险或不可用操作。
