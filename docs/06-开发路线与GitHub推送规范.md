# 开发路线与 GitHub 推送规范

仓库：`https://github.com/kuroii07/ComfyNeko`

## 开发主线

### M0：项目基线

统一品牌名称、产品文档、架构边界、路线图、开发日志与 Git 规则。完成后推送初始提交。

### M1：环境绑定

实现多 ComfyUI 环境档案、根目录/Python/目录映射预检、只读诊断与本机 API 可选探测。成功标准是：未改动任何绑定环境文件，也能给出可理解的诊断结果。

### M2：本地资产数据层

建立 SQLite 数据库、数据库迁移、路径白名单、后台任务、缓存和增量扫描基础。先实现索引正确性与取消恢复，再接 UI。

### M3：媒体与模型资产库

实现图片/视频/音频浏览、搜索、收藏、标签、模型哈希与资料。媒体详情页采用三栏结构；模型资料与文件事实分层保存。

### M4：工作流、提示词与 Run

实现 workflow 依赖解析、提示词预设、PNG metadata 读取与可选 Connector manifest。每个 Run 都能关联输入、输出、工作流、参数和模型身份。

### M5：安全变更与发布准备

实现 ChangePlan、应用回收站、导入体检、虚拟命名和审计日志。完成 Windows 真机回归、安装包、隐私说明和开源许可证。

## 分支、日志和推送规则

- `main`：只保存已通过当前里程碑验证的版本。
- `feat/<scope>`：活跃开发分支，例如 `feat/environment-profile`。每个可验证子里程碑完成后推送，不等待整个大功能结束。
- 每次提交前执行：`git diff --check`、对应测试、格式化/类型检查；未运行的检查必须写入开发日志。
- 每次推送同时更新 `docs/DEVELOPMENT_LOG.md`，记录目标、改动、验证、风险、下一步与提交标识。
- 严禁提交 API Key、令牌、真实本机配置、日志、数据库、缩略图缓存、模型、输入或 output 媒体。
- 合并 `feat/*` 到 `main` 前，必须完成该里程碑验收并向用户报告验证证据。

## 提交格式

```text
chore: initialize ComfyNeko project baseline
feat(env): add environment profile validation
feat(index): add incremental asset scan
fix(workflow): preserve missing-node diagnostics
docs: record M1 environment binding verification
```

## 推送节奏

不是按时间盲推，而是按可审查成果推送：一个功能边界、一组通过的测试、一份更新后的日志，组成一个推送点。遇到外部阻塞或验证失败时，也写入日志，但不把未验证实现合并到 `main`。
