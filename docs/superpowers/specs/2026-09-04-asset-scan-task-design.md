# M2.2 后台资产扫描任务设计

## 1. 目标

为 ComfyNeko 增加可持久化、可取消、可恢复的后台只读扫描任务。
扫描任务从已保存的环境档案读取受信任目录，逐目录发现资产并写入
ComfyNeko 自己的 SQLite 数据库。任务不得修改、删除、移动、重命名
或创建任何 ComfyUI 文件。

本里程碑同时提供一个最小扫描控制页，用于选择环境、开始扫描、查看
进度、停止扫描和恢复中断任务。它不是完整资产库，不展示资产网格。

## 2. 范围

### 2.1 包含

- 版本化 SQLite 迁移和应用级共享连接池。
- 扫描任务、待处理目录、扫描问题和资产在场状态的持久化。
- 每个环境最多一个未结束扫描任务。
- 目录级工作单元、逐条取消检查和目录级原子检查点。
- 取消后保留已提交结果，并使用同一个任务 ID 恢复。
- 应用异常退出后，把遗留运行任务标记为可恢复的 `interrupted`。
- 完整无阻断扫描成功后，将本轮未再次发现的资产标记为失效。
- 失效资产重新出现后恢复为有效，并保留原资产 ID。
- Tauri 启动、查询、列表、取消和恢复命令。
- 资产管理页中的最小扫描控制界面与顺序轮询。
- 中英文、亮暗主题、键盘操作和 240/320/420px 响应式。

### 2.2 排除

- 资产卡片、详情检查器、分页搜索和筛选。
- 缩略图、视频封面、音频波形。
- PNG metadata、提示词、工作流依赖和 Run 解析。
- SHA-256、模型资料、重复文件和移动文件识别。
- 文件监听和自动定时扫描。
- 删除、移动、重命名、修复或修改 ComfyUI 文件。
- Tauri 事件推送；本阶段以查询命令作为事实来源。
- 应用重启后的自动恢复；必须由用户明确点击“继续扫描”。

## 3. 核心原则

1. **源目录只读**：只调用目录枚举、元数据读取和路径规范化。
2. **数据库写入与源文件写入分离**：所有写入只进入 ComfyNeko 数据库。
3. **目录级原子性**：一个目录的资产、子目录、问题、计数和检查点在同一
   SQLite 事务提交。
4. **取消不回滚历史进度**：已经提交的目录保持完成；当前未提交目录恢复
   为待处理。
5. **宁可不标失效，也不能误标失效**：取消、失败、中断、根目录变化或
   读取问题均禁止执行失效清理。
6. **命令只接收 ID**：前端不能提交任意扫描路径；后端必须从已保存环境
   档案读取并快照允许扫描的目录。
7. **查询是事实来源**：前端通过顺序轮询读取持久化状态，不根据本地按钮
   点击自行猜测任务状态。

## 4. 数据库与连接

新增 `AppDatabase`，负责：

- 建立单一 `SqlitePool`。
- 启用外键、WAL 和合理的 `busy_timeout`。
- 通过 `sqlx::migrate!("./migrations")` 执行版本化迁移。
- 向环境仓储、资产仓储和扫描任务仓储提供克隆的共享连接池。

现有 `0001_environments.sql` 和 `0002_assets.sql` 保留不改。首次使用版本化
迁移打开旧数据库时，这两个脚本因 `IF NOT EXISTS` 可安全登记；从此由
`_sqlx_migrations` 保证 `ALTER TABLE` 迁移不会重复执行。

新增 `0003_asset_scan_tasks.sql`。

### 4.1 `assets` 新字段

- `last_seen_scan_id TEXT`
- `last_seen_at TEXT`
- `is_present INTEGER NOT NULL DEFAULT 1`
- `missing_since TEXT`

`indexed_at` 仍表示资产事实最后改变或首次写入的时间，不能代替本轮扫描
见证字段。即使资产事实完全未变化，也必须更新 `last_seen_scan_id`、
`last_seen_at` 并清除失效状态。

### 4.2 `asset_scan_tasks`

- `id TEXT PRIMARY KEY`
- `environment_id TEXT NOT NULL`
- `status TEXT NOT NULL`
- `roots_json TEXT NOT NULL`
- `processed_directories INTEGER NOT NULL DEFAULT 0`
- `discovered_assets INTEGER NOT NULL DEFAULT 0`
- `inserted_count INTEGER NOT NULL DEFAULT 0`
- `updated_count INTEGER NOT NULL DEFAULT 0`
- `unchanged_count INTEGER NOT NULL DEFAULT 0`
- `invalidated_count INTEGER NOT NULL DEFAULT 0`
- `issue_count INTEGER NOT NULL DEFAULT 0`
- `current_path TEXT`
- `cancel_requested_at TEXT`
- `error_code TEXT`
- `error_message TEXT`
- `created_at TEXT NOT NULL`
- `started_at TEXT`
- `updated_at TEXT NOT NULL`
- `finished_at TEXT`

同一环境在 `queued`、`running`、`cancelling`、`paused` 或 `interrupted`
状态下最多存在一个任务，使用 SQLite 部分唯一索引保证。

### 4.3 `asset_scan_directories`

- `task_id TEXT NOT NULL`
- `root_kind TEXT NOT NULL`
- `root_path TEXT NOT NULL`
- `directory_path TEXT NOT NULL`
- `state TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- 主键：`(task_id, root_kind, directory_path)`

目录状态只有 `pending`、`processing` 和 `done`。应用启动恢复时，将
`processing` 统一退回 `pending`。

### 4.4 `asset_scan_issues`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `task_id TEXT NOT NULL`
- `path TEXT NOT NULL`
- `code TEXT NOT NULL`
- `message TEXT NOT NULL`
- `created_at TEXT NOT NULL`

问题只记录事实，不导致进程崩溃。任何可能造成漏扫的目录或文件读取问题
都会阻止失效清理。

## 5. 任务状态机

```text
queued -> running -> completed
                  -> completed_with_issues
                  -> cancelling -> paused
                  -> failed

paused -> queued -> running
interrupted -> queued -> running

应用启动：
running/cancelling -> interrupted
processing directory -> pending
```

- `queued`：已持久化，等待 worker。
- `running`：worker 正在读取目录。
- `cancelling`：已收到停止请求，等待当前目录安全退出。
- `paused`：用户取消后可恢复。
- `interrupted`：应用退出或异常中断后可恢复。
- `completed`：完整根快照扫描成功并完成失效标记。
- `completed_with_issues`：扫描队列完成但存在读取问题，未执行失效标记。
- `failed`：数据库、序列化或内部任务错误；本阶段不自动恢复。

取消命令是幂等的。对 `paused`、`interrupted` 或终态再次取消时返回当前
快照，不产生错误。恢复只允许 `paused` 和 `interrupted`。

## 6. 根目录快照

开始扫描时，后端通过环境 ID 读取已保存的 `EnvironmentProfile`，只使用：

- `roots.models`
- `roots.input`
- `roots.output`
- `roots.workflows`

`custom_nodes` 不属于当前资产类型，不进入 M2.2。

根目录必须存在、是目录、规范化后仍位于用户保存的路径，并去重。根目录
快照序列化到任务中，恢复时不读取新的环境配置。最终完成前重新读取环境
档案并比较快照；如果目录配置已变化，任务进入 `completed_with_issues`，
不执行失效标记，用户可以基于新配置启动下一次扫描。

没有任何可扫描根目录时，开始命令返回结构化 `NO_SCAN_ROOTS` 错误，不
创建任务，也不改变已有资产状态。

## 7. 单目录发现

从现有 `discover_assets()` 提取：

```rust
pub fn discover_directory(
    environment_id: Uuid,
    root: &PreparedScanRoot,
    directory: &Path,
    should_cancel: impl Fn() -> bool,
) -> Result<DirectoryDiscovery, DirectoryDiscoveryError>
```

`DirectoryDiscovery` 包含：

- 当目录直接包含的受支持 `observations`
- 规范化、排序、未重复的 `child_directories`
- 可恢复的 `issues`

要求：

- `read_dir` 结果按规范化路径排序，保证测试和恢复行为稳定。
- 每个目录项处理前检查取消信号。
- 取消时丢弃当前目录尚未提交的内存结果，并把目录恢复为 `pending`。
- 不跟随符号链接、Windows junction 或其他 reparse point。
- 所有文件和子目录必须位于规范化根目录内。
- 保留现有 `discover_assets()` 作为兼容包装和 M2.1 回归入口。

## 8. 目录批次事务

worker 每次从数据库原子认领一个 `pending` 目录，并标记为 `processing`。
发现完成后，一个事务必须同时：

1. 对当前目录观察结果执行扫描感知的 upsert。
2. 为 unchanged 资产更新本轮见证字段并清除失效。
3. 将新子目录插入为 `pending`，重复目录忽略。
4. 写入扫描问题。
5. 将当前目录标记为 `done`。
6. 更新任务计数、`current_path` 和 `updated_at`。

事务失败时以上修改全部回滚，当前目录恢复为 `pending`，任务进入
`failed`。恢复扫描不会生成重复资产，也不会改变既有资产 ID。

## 9. 取消、恢复与重启

worker 使用任务专属 `Arc<AtomicBool>` 作为快速取消信号，同时数据库
保存 `cancel_requested_at` 和 `cancelling` 状态。

- 每个目录项前、目录发现结束后、事务提交前检查取消。
- 取消发生在目录发现期间：丢弃当前目录内存结果，目录回到 `pending`。
- 取消发生在目录事务完成后：保留已提交目录，从下一目录继续恢复。
- worker 确认停止后把任务写为 `paused`。
- `resume_asset_scan` 清除取消标记，将任务写为 `queued` 并启动同一任务 ID。
- 应用启动只执行状态归一化，不自动启动 worker。

## 10. 完成与失效标记

只有以下条件同时满足才允许完成失效标记：

- 没有 `pending` 或 `processing` 目录。
- 任务没有问题和内部错误。
- 未收到取消请求。
- 当前任务仍是该环境唯一且最新的活动任务。
- 当前环境根目录与任务快照一致。

满足条件时，在同一事务中：

1. 将该环境中 `last_seen_scan_id != task_id` 的资产设置
   `is_present = 0` 和 `missing_since = now`。
2. 保持已见资产 `is_present = 1`、`missing_since = NULL`。
3. 写入 `invalidated_count`。
4. 将任务标记为 `completed`。

存在扫描问题时任务标记为 `completed_with_issues`，不执行任何失效标记。
失效记录永不自动删除。文件重新出现时，扫描 upsert 清除失效状态并保留
原资产 ID。

## 11. 服务与 Tauri IPC

新增 `AssetScanService`，持有共享数据库、任务仓储和进程内取消句柄。
Tauri 只管理该服务，不把 Tauri 类型引入核心扫描实现。

命令：

```text
start_asset_scan(environment_id) -> AssetScanTaskSnapshot
get_asset_scan_task(task_id) -> AssetScanTaskSnapshot
list_asset_scan_tasks(environment_id?) -> AssetScanTaskSnapshot[]
cancel_asset_scan(task_id) -> AssetScanTaskSnapshot
resume_asset_scan(task_id) -> AssetScanTaskSnapshot
```

开始命令只接收环境 ID。同一环境已有可继续任务时返回该任务快照，不创建
第二个任务。未知环境、未知任务、无扫描根目录和非法状态返回带稳定 code
与可读 message 的结构化错误。

快照字段：

```text
id
environment_id
status
processed_directories
pending_directories
discovered_assets
inserted_count
updated_count
unchanged_count
invalidated_count
issue_count
current_path
can_cancel
can_resume
created_at
started_at
updated_at
finished_at
error { code, message, retryable } | null
```

## 12. 最小扫描控制页

“资产管理”不再显示通用规划占位，改为专用扫描控制页：

- 单层紧凑页首：标题、当前状态、主要操作。
- 必须显式选择一个已保存环境，不静默扫描列表第一项。
- 无环境时显示短空状态和“前往环境管理”。
- `开始扫描` 防重复点击。
- 运行中显示不定进度、已处理目录数、已发现资产数和当前路径。
- `停止扫描` 不需要二次确认，因为任务只读且可恢复。
- `cancelling` 显示“正在停止…”并禁用重复操作。
- `paused/interrupted` 显示内联恢复条和“继续扫描”。
- 完成显示新增、更新、未变化和失效数量。
- `completed_with_issues` 显示问题数量，并明确未执行失效标记。
- 错误使用 `role="alert"`；进度使用 `aria-live="polite"`。

前端使用 800ms 顺序轮询。前一次请求完成后才安排下一次，切换环境、
任务变化或组件卸载时通过 generation/ref 丢弃旧响应。离开资产页不取消
后端任务；回到页面时重新查询持久化任务。

视觉继续沿用当前 ComfyNexus 式扁平设置语言，不增加统计仪表盘、渐变
大卡片或资产网格。240/320/420px 时操作按钮改为整行堆叠。

## 13. 错误处理

- 不存在的环境：`ENVIRONMENT_NOT_FOUND`
- 没有扫描目录：`NO_SCAN_ROOTS`
- 同环境任务冲突：返回已有任务快照
- 不存在的任务：`SCAN_TASK_NOT_FOUND`
- 非法恢复状态：`SCAN_TASK_NOT_RESUMABLE`
- 根配置改变：任务问题 `SCAN_ROOTS_CHANGED`
- 数据库失败：`SCAN_DATABASE_ERROR`
- worker 异常：`SCAN_WORKER_ERROR`

错误不得包含密钥或整个用户目录树。当前路径可显示，但前端必须单行省略
并通过 title/可访问描述提供完整值。

## 14. 验收测试

### 14.1 数据库与仓储

- 旧 0001/0002 数据库升级后环境和资产数据不丢失。
- 重复迁移不会重复 `ALTER TABLE`。
- 同一环境不能创建第二个活动任务。
- 任务、目录队列、计数和问题关闭数据库后可完整读回。
- `processing` 在启动恢复时退回 `pending`，任务变为 `interrupted`。
- 目录资产写入和检查点失败时共同回滚。

### 14.2 扫描与取消

- 单目录发现排序稳定且不跟随 symlink/junction。
- 在第 N 个目录项触发取消后不提交当前目录。
- 取消确认后计数停止增长，源目录前后快照一致。
- 恢复沿用同一任务 ID，已完成目录不重复，资产 ID 不改变。
- 重复取消幂等，非法恢复返回稳定错误。

### 14.3 失效语义

- 首次扫描 A/B，删除 B 后完整成功只将 B 标记失效。
- B 重新出现后恢复有效且 ID 不变。
- cancelled、interrupted、failed、completed_with_issues 均不标失效。
- 空根、不可读根、根配置变化均不标失效。
- 多环境互不影响。

### 14.4 IPC 与前端

- 五个命令的参数和返回类型正确。
- 浏览器预览只返回空查询结果，写命令明确拒绝，不伪造成功。
- 无环境、环境加载失败、开始、轮询、停止、恢复、完成和失败状态可见。
- 不会静默选择环境并开始扫描。
- polling 不重叠，终态与卸载停止轮询，旧响应不会覆盖新任务。
- 240/320/420px 无横向溢出，亮暗与中英文可读。

### 14.5 全量门禁

- `cargo fmt --check`
- `cargo test`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `pnpm.cmd --dir apps/desktop test`
- `pnpm.cmd --dir apps/desktop build`
- Tauri debug `--no-bundle`
- `git diff --check`

## 15. 交付边界

本里程碑只提交源代码、迁移、测试和文档。不得提交用户数据库、扫描结果、
缓存、媒体文件、模型文件、构建目录或安装包。当前工作阶段不执行 Git
提交或推送，等待用户统一验收后再决定。
