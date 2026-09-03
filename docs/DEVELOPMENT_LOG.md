# ComfyNeko 开发日志

本日志与 Git 提交同步维护。每条记录必须说明已验证与未验证事项，不以“已完成”替代测试证据。

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
