# ComfyNeko

> 守住灵感，找回每一次生成。

ComfyNeko 是本地优先的 Windows 桌面软件：连接一套或多套 ComfyUI，统一管理模型、输入素材、输出媒体、提示词、工作流与可复现的生成记录（Run）。

## 当前阶段

- 阶段：~~M1 环境绑定与 Phase 0 环境基础~~ 已完成；环境领域、只读预检、受限运行时探测、SQLite 环境档案、Tauri IPC、四步向导和已保存环境列表均已落地。
- 当前目标：进入 Phase 1 资产库 MVP，先设计增量扫描、索引边界与可取消任务；在明确批准写操作前，继续保持已绑定 ComfyUI 目录只读。
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

## 项目目录

```text
assets/   设计参考、图标和许可来源记录
docs/     产品、架构、交互和实施文档
outputs/  可交付构建物、测试报告与演示素材
work/     调研、临时样本和过程文件
```
