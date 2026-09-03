# ComfyNeko

> 守住灵感，找回每一次生成。

ComfyNeko 是本地优先的 Windows 桌面软件：连接一套或多套 ComfyUI，统一管理模型、输入素材、输出媒体、提示词、工作流与可复现的生成记录（Run）。

## 当前阶段

- 阶段：~~M1 环境绑定与 Phase 0 环境基础~~ 已完成；环境领域、只读预检、受限运行时探测、SQLite 环境档案、Tauri IPC、四分区环境设置页和已保存环境列表均已落地。
- 环境路径：填写 ComfyUI 根目录后可自动识别 Python、模型、输入、输出、工作流与自定义节点目录；所有路径均可手动编辑，也可通过原生窗口选择并在资源管理器中打开。自动识别不会覆盖用户已经手动修改的值。
- 应用导航：已建立固定宽度的四字单层功能栏，包含首页总览、模型管理、资产管理、工作流库、提示词库和节点管理；环境管理与偏好设置固定在侧栏底部，未开发页面明确标记为规划中。
- 当前目标：Phase 1 的 M2.1 资产索引基础已完成；下一步实现后台扫描任务、取消与持久化恢复。在明确批准写操作前，继续保持已绑定 ComfyUI 目录只读。
- 环境设置：通用设置、加速与架构、模型路径、环境变量已按独立页签组织。加速页提供稳定兼容、平衡运行、性能优先、自定义四种本地草案预设，以及显存策略、注意力实现、精度、预览和日志级别的细项覆盖；变量页提供同步行号、`KEY=VALUE` 格式校验和可访问的行级错误提示。以上内容只更新 ComfyNeko 本地内存草案，不调用 Tauri、不触碰 ComfyUI 或系统环境变量。模型路径继续支持原生选择、打开和只读自动发现；加速参数与启动环境变量未来只会以可预览、备份和撤销的 ChangePlan 形式开放。
- 默认原则：只读、可预览、可撤销；不修改已绑定 ComfyUI 的任何配置，除非用户明确确认。

## 文档导航

- [产品需求与范围](docs/01-产品需求与范围.md)
- [技术架构与数据模型](docs/02-技术架构与数据模型.md)
- [环境绑定与安全设计](docs/03-环境绑定与安全设计.md)
- [界面信息架构](docs/04-界面信息架构.md)
- [路线图与验收标准](docs/05-路线图与验收标准.md)
- [开发路线与 GitHub 推送规范](docs/06-开发路线与GitHub推送规范.md)
- [开发执行与体验基线](docs/07-开发执行与体验基线.md)
- [开发日志](docs/DEVELOPMENT_LOG.md)
- [环境绑定基础实施计划](docs/superpowers/plans/2026-09-03-environment-foundation.md)
- [VisionHub 启发式桌面 UI 改版计划](docs/superpowers/plans/2026-09-03-visionhub-inspired-ui-refresh.md)
- [已保存环境列表与 Tauri 持久化验收计划](docs/superpowers/plans/2026-09-03-saved-environment-library-and-tauri-smoke.md)
- [ComfyNexus 启发式环境设置设计](docs/superpowers/specs/2026-09-03-comfynexus-environment-settings-design.md)
- [ComfyNexus 启发式环境设置实施计划](docs/superpowers/plans/2026-09-03-comfynexus-environment-settings.md)

## 项目目录

```text
assets/   设计参考、图标和许可来源记录
docs/     产品、架构、交互和实施文档
outputs/  可交付构建物、测试报告与演示素材
work/     调研、临时样本和过程文件
```
