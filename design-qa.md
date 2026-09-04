# ComfyNeko VisionHub 视觉对照

> 范围说明：本文件记录的是早期偏好设置页与 VisionHub 参考图的历史视觉验收，不覆盖当前 ComfyNexus 风格的媒体资产库。下方 `final result: passed` 仅对当时的偏好设置页成立；资产库仍需单独验证只显示图片、视频和音频，并确认模型、工作流与节点插件不会进入媒体列表。

## 2026-09-04 媒体资产库职责验收

- 设计读法：专业本地媒体管理器，参考 ComfyNexus 的单层工具布局；设计变化度 4/10、动效 2/10、信息密度 7/10。
- 信息架构：通过。快捷筛选仅有全部、图片、视频、音频；左侧仅有全部资产、输入素材、生成结果；模型、工作流和节点插件没有资产库入口。
- 数据边界：通过。资产页请求固定 `media_only=true`，自动化样本和本机数据库核对均得到 69 条媒体资产；19 个模型与 8 个工作流未计入资产库总数。
- 响应式：通过。中文亮色覆盖 1504/1180/560/320/240px，英文暗色覆盖 1180/320/240px，根文档与资产页 `clientWidth === scrollWidth`。
- 状态与可访问性：通过。搜索、环境选择、扫描状态、媒体筛选、目录筛选、加载/空/错状态均保留语义标签；浏览器控制台 0 error。
- 本轮评分：86/100，达到当前职责边界和列表壳层门槛，但不代表资产库视觉完成。
- 已知限制：尚未接入真实缩略图和媒体预览；1180px 英文工具栏的长选项会省略显示；240px 分类栏依赖横向滚动。后续视觉优化应优先处理这三项。
- 截图：`output/playwright/asset-media-boundary/`。

## 对照基准

- Source visual truth: user-supplied VisionHub reference screenshot (not committed)
- Implementation screenshot: `work/design-qa/implementation-settings-refined-final-1442x954.png`
- Full comparison: `work/design-qa/comparison-settings-refined-final.png`
- Focused comparison: `work/design-qa/comparison-settings-focus-final.png`
- Viewport: 1442 × 954 CSS px
- Source pixels: 1442 × 954
- Implementation pixels: 1442 × 954
- Device scale factor: 1
- Density normalization: none required
- State: light theme, Chinese locale, preferences page, collapsed sidebar

## Full-view comparison evidence

- 主内容采用与参考一致的居中单列设置页，不再使用控制台、状态仪表盘或多列卡片。
- 收起侧栏宽度为 84px，导航选中态使用浅蓝背景，底部保留主题与侧栏操作。
- 主体内容宽度、标题起始位置、分组间距、白色列表卡和页面留白已与参考结构对齐。
- ComfyNeko 当前仅展示已经实现的环境与偏好功能，因此导航数量和设置条目少于 VisionHub；这是产品范围差异，不是布局漂移。

## Focused-region comparison evidence

- 标题层级、说明文字、分组标签、18px 圆角、74px 设置行、细分隔线与右侧分段控件均对齐参考。
- 页头已补齐参考图中的两个紧凑工具入口，并提供实际可操作的本页说明与键盘操作浮层。
- 字体沿用 Windows 桌面端的 Segoe UI Variable；字重和字号层级接近参考。
- 色彩使用冷灰背景、白色内容面与单一浅蓝强调色；没有渐变、状态胶囊或装饰性仪表盘。
- 当前页面没有位图内容；图标统一来自项目现有 Lucide 图标库，品牌图标沿用 ComfyNeko 自有资源。
- 文案已按 ComfyNeko 的环境管理语义重写；偏好页补齐界面动效、本地数据、安全策略与版本信息。

## Findings

- No actionable P0/P1/P2 findings remain.
- [P3] 参考页使用英文眉题，当前 ComfyNeko 按用户要求保留更简洁的单标题结构。
- [P3] ComfyNeko 品牌图标与 VisionHub 猫图标不同，属于项目品牌资产差异。

## Comparison history

1. Initial implementation
   - [P2] 设置组可用内容宽度约 932px，比参考的约 1000px 偏窄。
   - Fix: 将页面外层最大宽度从 1000px 调整为 1068px，在保留 34px 内边距后得到约 1000px 的内容宽度。
2. Post-fix comparison
   - 内容左右边界、标题位置和设置组比例与参考图一致。
3. Detail refinement
   - Added compact header utilities, complete settings information rows, meaningful empty-field placeholders, and a blue-consistent dark theme.
   - Verified the 1180 × 780 desktop window viewport without horizontal overflow or hidden persistent controls.
   - No remaining actionable P0/P1/P2 findings.

## Interaction verification

- 环境管理与偏好设置导航可切换。
- 侧栏展开与收起可切换并持久化。
- 浅色、深色、跟随系统可切换；深色切换时 `html[data-theme="dark"]` 正确更新。
- 中文与 English 控件可操作。
- 本页说明与键盘操作浮层可打开、切换和关闭。
- 浏览器预览在非 Tauri 环境显示诚实的“暂无已保存环境”，不再抛出 IPC 错误。
- Browser console warnings/errors checked: none.

## Follow-up polish

- 后续功能增加时继续沿用单列设置组，不引入仪表盘式状态卡。
- 可在不增加噪声的前提下补充帮助与快捷键入口。

final result: passed
