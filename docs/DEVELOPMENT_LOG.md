# ComfyNeko 开发日志

本日志与 Git 提交同步维护。每条记录必须说明已验证与未验证事项，不以“已完成”替代测试证据。

## 2026-09-03 — M2.1 只读资产索引基础

- 状态：M2.1 完成；Phase 1 继续开发，下一步进入后台扫描任务与取消恢复。
- 领域：新增图片、视频、音频、模型、工作流五类 `AssetKind`，以及输入、输出、模型、工作流四类 `AssetRootKind`；资产观察与记录支持序列化并保留 Windows 中文路径。
- 发现：新增根目录角色约束的大小写不敏感扩展名分类；递归扫描仅使用目录、元数据和规范化路径读取，不跟随目录符号链接，不收录不支持的文件；单个非法根目录会生成机器可读问题且不丢弃其他有效观察。
- 持久化：新增 `0002_assets.sql` 和共享迁移入口；以 `(environment_id, normalized_path)` 防重。同一观察返回 `Unchanged` 且不写更新，大小、mtime、类型或根角色变化返回 `Updated` 并保留资产 ID；同一路径在不同环境中保持隔离。
- 测试先行：分类、发现和仓储均先确认缺少目标接口的预期失败再实现；另通过序列化 RED/GREEN 和超出 SQLite 有符号整数范围的文件大小 mutation 检查补齐边界。
- 验证：前端 7 个测试文件、21 个测试通过；Rust 19 个单元测试、4 个资产仓储测试、3 个环境命令测试、3 个环境仓储测试通过；Clippy `-D warnings`、Vite 构建、真实环境只读 smoke 和 Tauri debug `--no-bundle` 构建通过。
- 安全边界：未实现文件删除、移动、重命名、改写、哈希、缩略图、元数据解析、文件监听或资产 UI；未使用 Computer Use。真实 ComfyUI smoke 仍输出 `valid=[]`、`PYTHON_NOT_FOUND` 和 `API_UNREACHABLE`，递归快照前后一致。
- 下一步：M2.2 建立可取消的后台扫描任务、SQLite 检查点和恢复语义；只有完整扫描成功后才标记未再次发现的记录为失效。

## 2026-09-03 — Phase 0 自动化持久化与只读验收

- 状态：Phase 0 环境基础完成，下一阶段进入资产库 MVP。
- 测试先行：新增命令服务文件数据库重启读回测试；测试最初因 `EnvironmentCommandService::connect_file` 不存在而编译失败，实现统一文件连接入口后转绿。
- 改动：Tauri 启动与集成测试复用同一个 `EnvironmentCommandService::connect_file` 构造入口；测试在临时 SQLite 文件中保存“公司环境”和“家里环境”，释放服务后重新连接并完整读回两个档案。
- 只读验收：使用 `D:\AIGC\ComfyUI Installs\ComfyUI_Company\ComfyUI` 与 `D:\AIGC\ComfyUI Installs\ComfyUI_Company\standalone-env\python.exe` 执行 opt-in ignored smoke；有效环境无阻塞诊断，错误 Python 返回 `PYTHON_NOT_FOUND`，离线本机 API 返回 `API_UNREACHABLE`，绑定根目录递归快照前后一致。
- 构建验收：前端测试与 Vite 构建、Rust 格式化、Clippy、完整测试、真实环境 smoke、Tauri debug `--no-bundle` 构建和差异检查均作为本次提交门禁重新执行；桌面产物为仓库根目录下的 `target/debug/comfyneko.exe`。
- 验收边界：用户批准以后默认不用 Computer Use，以自动化集成测试替代真实窗口保存/重启点击；因此本记录不声称完成真实鼠标点击或 WebView2 人工视觉验收。
- 下一步：进入 Phase 1，先固定资产索引领域模型、只读增量扫描边界、取消/恢复语义和对应验收测试。

## 2026-09-03 — M1.4 已保存环境列表

- 状态：前端功能完成，真实 Tauri 保存/重启读回待执行。
- 测试先行：先创建 `EnvironmentManager` 测试，确认组件缺失；实现加载、选择、空状态和错误重试后转绿。保存后刷新行为先确认因缺少 `onSaved` 回调而失败，再接入向导成功回调并转绿。
- 改动：新增环境管理容器，启动时调用现有 `list_environments`；展示已保存档案数量、名称和根目录，允许选择档案进入向导；数据库异常显示错误与重试；空数据库显示诚实空状态；保存成功后重新读取数据库列表。
- 边界：只复用已有 `EnvironmentApi`，未修改 Rust、SQLite 表结构、Tauri 权限或探测/保存规则。
- 验证：前端 7 个测试文件、21 个测试通过；TypeScript + Vite 生产构建成功；`git diff --check` 无空白错误。
- 下一步：使用公司电脑上的真实 ComfyUI 根目录和 Python 解释器，在 Tauri WebView2 窗口完成保存、关闭、重启和列表读回，并比对绑定目录前后快照。

## 2026-09-03 — M1.4 续开发计划：已保存环境与真实窗口读回

- 状态：计划已建立，准备进入测试先行实现。
- 目标：使用现有 `list_environments`、`save_environment` 和 SQLite 文件数据库，补齐已保存环境的加载、空状态、错误重试、档案选择与保存后刷新，再通过真实 Tauri 窗口完成保存/重启读回。
- 边界：不新增删除、移动、扫描、Shell 或宽泛文件系统权限；不改变 Rust 后端的阻塞诊断与只读预检规则。
- 计划：`docs/superpowers/plans/2026-09-03-saved-environment-library-and-tauri-smoke.md`。

## 2026-09-03 — VisionHub 风格 UI 阶段二：环境工作区与视觉 QA

- 状态：第一轮结构、视觉、动效和响应式改版完成；后续仍保留渐进式视觉优化空间。
- 测试先行：工作区/状态轨、步骤完成态、请求锁定、CSS 状态属性与可访问保存状态测试先因目标结构缺失而失败；实现后前端 6 个测试文件、17 个测试通过。
- 组件：新增 `EnvironmentWorkspace`、`EnvironmentStepRail`、`EnvironmentStatusRail`、`EnvironmentActionBar`、共享向导类型与测试夹具；状态轨展示档案完整度、Python、本机 API、只读说明和真实诊断，不新增虚构业务。
- 交互：增加工作区/步骤进入、按钮反馈和检查/保存状态脉冲；`prefers-reduced-motion` 会关闭动画和位移。步骤完成态使用勾选图标与文本，待检查/可保存/阻塞使用图标、文案和颜色共同表达。
- 响应式：覆盖 1366px、420px、320px、240px；首次 240px 截图发现内部横向滚动与英文标题孤字，已通过最窄断点单列状态卡、缩小标题和内容区横向裁切解决。
- 视觉 QA：截图位于 `outputs/playwright/visionhub-refresh/`；浏览器控制台 0 error，根文档各目标宽度 `clientWidth === scrollWidth`，键盘聚焦侧栏按钮会显示 Tooltip。`design-qa.md` 得分 92/100，`final result: passed`。
- 安全边界：Rust、Tauri IPC、SQLite、环境探测和保存行为未改变；浏览器交互只验证表单前进与保存按钮在预检前保持禁用。
- 下一步：在真实 Tauri WebView2 完成保存/重启读回；继续优化窄侧栏、状态卡文案、Windows DPI 与高对比度体验。

## 2026-09-03 — VisionHub 风格 UI 阶段一：应用壳层与环境控制条

- 状态：阶段一完成，环境工作区组件拆分与状态轨仍待实现。
- 测试先行：新增应用壳层品牌副标题/底部偏好区测试，以及环境控制条的安全状态与真实操作入口测试；首次运行按预期因目标结构不存在而失败。
- 改动：侧栏收紧到 196px，品牌区增加“ComfyUI 资产中枢”，主题、语言与折叠控制统一收口到底部；主内容改为固定视口独立滚动。页面顶部新增带本地优先、只读预检、API 可选状态的 sticky 控制条，并提供“开始配置”“查看诊断”两个真实定位操作。
- 视觉：统一亮/暗主题的面板、中性色、紫蓝强调色、圆角、阴影与动效时长 Token；按钮保持纯色/描边，不使用装饰性渐变。
- 验证：`pnpm.cmd --dir apps/desktop test` 通过 6 个测试文件、12 个测试；`pnpm.cmd --dir apps/desktop build` 成功；`git diff --check` 无空白错误。
- 安全边界：未修改 Rust、Tauri IPC、SQLite、环境探测或保存行为，仍为只读预检边界。
- 下一步：拆分环境工作区、步骤轨、状态轨和底部操作栏，并补齐加载、语义状态与响应式视觉。

## 2026-09-03 — VisionHub 风格 UI 第一轮改版设计

- 状态：设计方向与书面规格已由用户确认，实施计划已建立。
- 目标：参考 Kuroii VisionHub 的固定侧栏、页面控制条、分层卡片、状态胶囊、信息密度与克制动效，重构 ComfyNeko 当前环境绑定界面。
- 设计边界：保留 ComfyNeko 紫蓝品牌与全部业务逻辑；主操作使用纯色、描边或轻底色，不使用装饰性渐变；不新增虚构功能或数据。
- 规格：`docs/superpowers/specs/2026-09-03-visionhub-inspired-ui-refresh-design.md`。
- 计划：`docs/superpowers/plans/2026-09-03-visionhub-inspired-ui-refresh.md`。
- 下一步：按计划从应用壳层、环境工作区、动效状态、响应式与视觉 QA 六个检查点逐步实现。

## 2026-09-03 — 公司端同步与 M1.4 向导/IPC 接续

- 状态：阶段性完成；M1.4 仍在开发中，尚未完成真实 Tauri 窗口的保存/重启读回验收。
- 同步：公司电脑已从 `origin/feat/environment-profile` 建立同名跟踪分支与 `.worktrees/environment-profile` 隔离工作树；主目录 `main` 保持干净。补装 Rustup stable MSVC 工具链，确认 Node 24.19.0、pnpm 11.19.0、WebView2 与 Visual Studio Community 2026 可用。
- 后端：新增 SQLite 文件连接，应用启动时在 `%LOCALAPPDATA%\com.kuroii.comfyneko\comfyneko.db` 初始化迁移；注册环境探测、保存和列表三个 Tauri command。保存命令会在后端重新探测，调用方不能用伪造空诊断绕过阻塞检查。
- 前端：完成四步环境绑定向导、Tauri API 适配层、诊断列表、加载/成功/错误/空状态和中英文文案；补充成功、警告、错误主题 Token。修复 240px 英文长标题导致的横向溢出。
- 测试先行：先确认文件数据库重连测试因 `connect_file` 缺失而失败，再实现并转绿；先确认命令自主复检测试因 `probe_and_save_environment` 缺失而失败，再实现并转绿；先确认四步向导测试因旧组件不支持步骤/API 而失败，再实现并转绿。
- 验证：前端 6 个测试文件、11 个测试通过；TypeScript + Vite 生产构建通过。Rust `cargo check`、`cargo clippy -D warnings`、普通测试通过（12 个单测、2 个命令测试、3 个仓储测试）。真实环境 ignored smoke 使用 `ComfyUI_Company\ComfyUI` 与 `standalone-env\python.exe`，覆盖有效环境、错误 Python 和离线本机 API，诊断分别为无阻塞、`PYTHON_NOT_FOUND`、`API_UNREACHABLE`，递归目录快照确认探测前后未改变绑定根目录。
- 视觉：Playwright 检查 1366px 亮色中文、暗色英文折叠侧栏以及 240/320/420px；最终三种窄宽度均无横向溢出，控制台 0 error。截图保存在 `outputs/playwright/`。当前应用级 UI 自检约 82/100，因设置页、Tooltip 边缘翻转/延迟、DPI/High Contrast 和真实窗口完整键盘路径未完成，不标记 UI 基线完成。
- 已知限制：Computer Use 连续两次无法捕获 Tauri WebView2 窗口，系统返回 `SetIsBorderRequired failed: 不支持此接口 (0x80004002)`；因此本轮只确认桌面进程启动和应用数据库创建，未通过自动化点击真实窗口的“检查环境/保存环境”按钮。
- Git：本轮未提交、未推送。建议以 `feat(env): connect onboarding wizard to persistent Tauri commands` 为提交边界，用户确认后再推送。
- 下一步：在可交互的真实 Tauri 窗口完成保存与重启读回；展示已保存环境列表；再补设置页、Tooltip 边缘处理、DPI/High Contrast 与完整键盘验收。

## 2026-09-03 — 暂停点：Tauri Windows 桌面壳层

- 状态：已建立并暂停在可编译的桌面壳层；M1.4 仍在开发中，路线项未划线。
- 改动：补齐 Tauri 2 的 Windows 二进制入口、构建脚本、应用配置与最小能力声明；React/Vite 的开发和构建命令由 Tauri 配置显式调用。新增项目内 `@tauri-apps/cli`，并从已确认的亮色品牌 Icon 生成 Windows `.ico` 和其他平台尺寸图标。能力文件只授予 `core:default`，未开放文件系统、Shell 或任意本地路径权限。
- 验证：`pnpm --dir apps/desktop exec tauri info` 确认当前 Windows WebView2、MSVC、Rust、Node 和 pnpm 环境可用；`cargo check -p comfyneko-core --bin comfyneko` 与 `cargo clippy -p comfyneko-core -- -D warnings` 通过。
- 暂停说明：下一条“应用数据库文件重启后仍可读回档案”的测试已写入本地工作树，尚未得到最终 Red/Green 结果，也未纳入本次提交；恢复后从该测试继续实现 `connect_file` 和受限 IPC。未生成安装包、未启动桌面窗口、未改动真实 ComfyUI 或用户媒体。
- 下一步：恢复后先完成数据库文件连接的测试先行循环，再接入 Tauri IPC 和 React 环境向导。

## 2026-09-03 — M1.4 阶段四：环境档案命令边界

- 状态：阶段性完成；M1.4 仍在开发中，路线项未划线。
- 改动：在 Rust 核心建立 `EnvironmentCommandService`，作为未来 Tauri IPC 的最小命令边界：只提供环境档案读取和“无阻塞诊断才允许保存”。它复用仓储的拦截规则，并将持久化故障转换为面向调用方的稳定错误类型。
- 测试先行：先创建命令层 integration test，确认因 `commands` 模块不存在而得到预期编译失败；实现后再次验证，阻塞档案被拒绝且不能替换已保存环境。
- 验证：当前命令层定向测试通过。提交前会重跑全部 Rust 测试、Clippy、格式化和差异检查。
- 未验证：此阶段尚未引入 `tauri` crate、`tauri.conf.json` 或桌面二进制，因此还不是可从 WebView 调用的 IPC command；这是为了先固定可测业务边界，随后用最小 Tauri 壳层安全地桥接它。
- 下一步：补齐实际 Tauri 应用壳层与最小受限 IPC，再由 React 通过受控 API 读取/保存环境档案。

## 2026-09-03 — M1.4 阶段三：SQLite 环境档案仓储

- 状态：阶段性完成；M1.4 仍在开发中，路线项未划线。
- 改动：新增 SQLx + SQLite 环境档案迁移与仓储。档案只保存环境名称、路径、可选本机 API、目录映射和校验时间；未复制、扫描或改动任何真实 ComfyUI、Python、模型、输入或输出文件。`save_if_valid` 会在任一阻塞诊断存在时拒绝写入，避免把无效环境带入后续索引流程。
- 测试先行：先新增“阻塞诊断不得持久化”和“有效 Windows 路径档案可完整读回”两条 integration test；首次因 `repositories` 模块尚不存在而预期失败。随后完成最小仓储、迁移和错误映射实现，测试转绿。
- 验证：已执行 `cargo fmt --check`、`cargo clippy -p comfyneko-core -- -D warnings`、`cargo test -p comfyneko-core`；12 个既有单测与 2 个仓储 integration test 均通过，0 个失败、0 个 Clippy 警告。提交前还会复跑并执行 `git diff --check`。
- 未验证：尚未建立 Tauri command、实际 app-data 数据库定位、正式四步向导与真实 Windows 绑定 smoke test；SQLite 目前只在受测内存数据库中运行。M1.4 不因此标记为完成。
- 下一步：以最小受限 Tauri command 暴露档案读取/保存，再让前端向导处理加载、成功、错误和空状态。

## 2026-09-03 — M1.4 阶段二：Token 化应用外壳与视觉复查

- 状态：阶段性完成；M1.4 与 UI 基线都未标为最终完成。
- 改动：建立唯一 CSS Token 入口，支持亮色、暗色与跟随系统；新增运行时语言切换、可持久化的折叠侧栏、sticky 页面说明栏、正式 Vite 应用入口与复用用户确认 PNG 的亮/暗品牌标记。纯图标侧栏操作改用鼠标悬停和键盘焦点均可触发的 Tooltip。环境页已接入阻塞诊断的禁用保存状态。
- 测试先行：分别为偏好写入、侧栏收起、主题切换、语言切换、内容区语言同步、sticky 说明栏和 Tooltip 焦点展示先记录失败测试；实现后均转绿。
- 验证：`pnpm test` 通过（6 个测试文件、10 个测试，0 个失败）；`pnpm exec tsc -b` 与 `pnpm build` 通过。Playwright 真浏览器检查 1366px 亮/暗与 320px 暗色布局，未见横向溢出；控制台 0 error。截图保存在 `outputs/playwright/`（该目录默认不提交）。
- 自检评分：72/100，未达到 85 分，不宣称 UI 基线完成。已覆盖主题、语言、侧栏、Token、Tooltip、焦点环与减弱动效；待补齐正式设置页、完整向导表单的加载/成功/错误/空状态、Tooltip 边缘翻转与延迟、240/420px、DPI、High Contrast 和完整键盘路径。
- 环境：Playwright 封装脚本在本机因缺少 Bash 不可运行，改用同一工具链的 `npx --package @playwright/cli` 直连方式完成真实浏览器检查；临时会话目录已加入 Git 忽略，不影响仓库。
- 下一步：建立 SQLite 迁移与环境档案仓储，随后让完整向导补齐表单状态并继续提高 UI 验收分数。

## 2026-09-03 — M1.4 阶段一：可测试的 UI 基础

- 状态：阶段性完成；M1.4 仍在开发中，未划掉路线项。
- 改动：建立 React + TypeScript + Vite + Vitest 的项目内前端工具链；新增中英文消息字典（缺失键回退英文）、安全读取的外观/语言/侧栏偏好基础，以及环境向导的第一条安全行为：存在阻塞诊断时，“保存环境”按钮不可用且给出可访问说明。所有当前用户可见文本从字典读取。
- 测试先行：先运行向导测试，确认它因 `EnvironmentWizard` 不存在而失败；随后为 i18n fallback 与损坏偏好回退分别记录预期失败测试，完成最小实现后转绿。
- 工具链修复：TypeScript 发现 Vitest 2 内置 Vite 5 与直接依赖的 Vite 6 产生插件类型冲突。核对依赖树后，将直接 Vite 依赖对齐至 `^5.4.21`；类型检查与测试恢复通过。pnpm 仅在项目 `pnpm-workspace.yaml` 中允许 Vite 必需的 `esbuild` 构建脚本，未修改全局 pnpm 配置。
- 验证：`pnpm exec tsc -b` 通过；`pnpm test` 通过（3 个测试，0 个失败）；`git diff --check` 通过。
- 未验证：尚未建立正式入口、视觉样式、设置/导航外壳、SQLite 迁移、Tauri command 或真实 Windows 桌面窗口；`pnpm build` 尚不适用，因为应用入口尚未创建。未访问或改动任何真实 ComfyUI、Python 或媒体路径。
- 下一步：建立 Token 化的亮/暗/跟随系统外壳、设置与可折叠侧栏，再把向导接入 SQLite 持久化和 Tauri command。

## 2026-09-03 — M1.3 有边界的运行时探测

- 状态：完成。
- 改动：新增 Python 探测，分别以超时上限执行 `--version` 与 `comfy` import 检查，超时会终止子进程；新增 API 探测，严格拒绝 `127.0.0.1` 以外的主机，只对本机 `GET /system_stats` 发起有限时连接。不可达本机 API 是警告；远程 API 是阻塞诊断。运行时预检在基础路径存在阻塞时不会执行 Python 或本机 API；但仍会拒绝远程 API，且绝不连接远程主机。
- 诊断代码：`PYTHON_TIMEOUT`、`PYTHON_START_FAILED`、`PYTHON_WAIT_FAILED`、`PYTHON_OUTPUT_FAILED`、`PYTHON_COMMAND_FAILED`、`PYTHON_OUTPUT_EMPTY`、`API_HOST_NOT_ALLOWED`、`API_UNREACHABLE`。
- 测试先行：已先记录 Python 超时转换、远程 API 拒绝、本机不可达 API 为警告三个预期失败测试；随后补充“未配置 Python 时也必须拒绝远程 API”的安全回归测试，先验证其因原先提前返回而失败，再完成最小修复并通过。
- 验证：`cargo fmt --check`、`cargo clippy -p comfyneko-core -- -D warnings` 和 `cargo test -p comfyneko-core` 均通过（12 个单测，0 个失败）；另单独运行远程 API 安全回归测试通过。`git diff --check` 通过。
- 环境：本机缺少 Clippy，已用 `rustup component add clippy` 安装后复验；`rustfmt` 已在 M1.1 安装。
- 未验证：尚未对用户的真实 Python、ComfyUI 或 API 执行探测，也未创建、修改或扫描其任何目录；SQLite、Tauri command 与 React 向导留待 M1.4。
- Git：实现提交 `e87c8dd`；本日志、README 与路线更新将以独立文档提交推送到 `feat/environment-profile`。
- 下一步：M1.4 先搭建共享 UI 基础（Token、主题、i18n、导航、Tooltip、说明栏），再实现 SQLite 持久化与环境绑定向导。

## 2026-09-03 — M1.2 只读路径预检与诊断

- 状态：完成。
- 改动：新增路径规范化守卫与环境预检。根目录必须是含 `main.py` 的可读目录；Python 路径缺失会阻塞；不存在的资产目录只给警告且不会创建；误选普通文件会给出专用阻塞诊断。
- 诊断代码：`COMFY_ROOT_NOT_FOUND`、`COMFY_ROOT_NOT_DIRECTORY`、`COMFY_ROOT_UNREADABLE`、`COMFY_ROOT_NOT_RECOGNIZED`、`PYTHON_NOT_CONFIGURED`、`PYTHON_NOT_FOUND`、`ASSET_ROOT_NOT_FOUND`、`ASSET_ROOT_NOT_DIRECTORY`、`ASSET_ROOT_UNREADABLE`。
- 验证：先确认 `probe_environment` 不存在导致的预期编译失败；随后完成有效根目录、缺失 Python、无 `main.py`、普通文件根目录、缺失资产目录和普通文件资产目录的 6 条夹具测试。`cargo fmt --check` 通过，`cargo test -p comfyneko-core` 通过（7 个单测，0 个失败）。
- 未验证：未模拟 Windows ACL 拒绝的真实目录；代码已通过 `canonicalize` 与 `read_dir` 以阻塞方式处理该情况。真实 Python 执行与 API 探测留待 M1.3。
- Git：实现提交 `128fa4a`；本日志提交后推送 `feat/environment-profile`。
- 下一步：M1.3 增加有超时上限的 Python 版本探测和仅允许 `127.0.0.1` 的可选 ComfyUI API 探测。

## 2026-09-03 — M1.1 环境领域类型

- 状态：完成。
- 改动：建立 Rust 工作区与 `comfyneko-core`；新增 `EnvironmentProfile`、`EnvironmentRoots`、`ApiBinding`、`Diagnostic` 与 `Severity` 的可序列化领域类型。环境档案只保存路径和元数据，不执行文件修改。
- 验证：先运行测试，得到预期失败 `E0432`（`EnvironmentProfile` 尚不存在）；实现后运行 `cargo fmt --check`、`cargo test -p comfyneko-core profile_round_trips_without_losing_windows_paths` 与 `cargo test -p comfyneko-core`，均通过（1 个单测，0 个失败）。
- 环境：本机 Rust 缺少 `rustfmt`，已使用 `rustup component add rustfmt` 补齐后复验通过。
- 未验证：尚未接入 Tauri 窗口、React UI、SQLite 或真实 ComfyUI 路径；这些不属于 M1.1。
- Git：领域类型提交 `02c71b5`；本日志提交后推送 `feat/environment-profile`。
- 下一步：M1.2 实现只读路径发现、ComfyUI 根目录识别与阻塞诊断。

## 2026-09-03 — M1 开发规范对齐

- 状态：完成。
- 改动：将全流程软件开发、Windows/Tauri 工程、软件 UI/UX 与 Kuroii Desktop UI/UX Skill 的适用规则写入项目执行基线，并将环境绑定向导的 UI 基础要求补入实施计划。
- 验证：已逐条对照 Desktop Profile、主题、多语言、侧栏、Tooltip、响应式、组件状态与可访问性规则；当前仍未实现业务功能，首条 Rust 测试已按测试先行原则确认因目标类型不存在而失败。
- 风险：现有 M1 计划只列出向导页面，若不先建立共享主题/i18n/导航基础会造成后续返工；现已明确将其作为向导实现前置条件。
- 下一步：在 `feat/environment-profile` 按更新后的基线完成环境领域类型与对应测试。

## 2026-09-03 — M1 开工准备

- 状态：完成。
- 改动：为 `feat/environment-profile` 增加项目内隔离工作树规则；`.worktrees/` 已加入 Git 忽略列表。
- 验证：确认当前 `main` 与 `origin/main` 同步且工作区干净；尚未创建应用代码，因此无测试可运行。
- 下一步：创建隔离工作树，在功能分支按测试先行实现环境领域类型。

## 2026-09-03 — M0 品牌资产定稿

- 状态：完成并待同步远程仓库。
- 改动：从用户确认的透明 PNG 母版无损裁切暗/亮主题的 Icon 与横版 Logo，存入 `assets/brand/`；补充主题使用与尺寸说明。
- 验证：母版为 `1536 × 1024`、`Format32bppArgb`，确认存在 Alpha 通道；四个导出文件均为带 Alpha 的 PNG。已逐张检查暗色 Icon、暗色 Logo 与亮色 Logo 的构图和边缘，未重绘品牌图形。
- 未验证：尚未生成 Windows `.ico`、安装包图标或在实际 Tauri 界面中测试缩放效果，留待桌面端工程建立后处理。
- Git：本条对应提交应推送到 `kuroii07/ComfyNeko` 的 HTTPS remote。

## 2026-09-03 — M0 项目基线

- 状态：本地完成；首次远程推送被 GitHub SSH 账号权限阻塞。
- 目标：建立 ComfyNeko 的产品定位、环境绑定优先级、架构、界面信息、路线图和实施计划。
- 改动：建立项目骨架；写入产品/架构/安全/界面/验收文档；增加环境绑定实施计划；确定 GitHub 推送与日志规则。
- 验证：已检查目录骨架、文档导航和计划中的占位词；尚未创建应用代码，因此无构建或单元测试。
- Git：本地项目已改名为 `ComfyNeko`；提交 `786be79` 建立项目基线，提交 `d9b3077` 保留了远程初始 README 历史。SSH 推送被拒绝，原因是当前密钥认证为 `BlueSummer2333`，没有 `kuroii07/ComfyNeko` 的写权限。
- 风险：不应通过关闭 TLS 校验绕过 HTTPS 连接问题，也不应使用无授权账号推送。
- 下一步：为 `BlueSummer2333` 授予该仓库写权限，或在本机认证为 `kuroii07` 后重新推送；随后从 M1 环境绑定开始。
