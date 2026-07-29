# 需求转为四象限任务客户端接入

## 目标与范围

- 用户目标：需求池中的需求可以选择四象限后转为任务，从而进入正常任务工作台消费。
- 本任务只修改 Windows 客户端：调用本地服务的转换接口、维护客户端需求/任务状态，并提供中文交互与错误反馈。
- 不修改服务源码、容器、镜像、数据库、凭证、远程仓库、发布配置或用户数据。

## 可追溯性

| 字段 | 记录 |
|---|---|
| 日期 | 2026-07-29 |
| 初始基线 SHA | `f9e97ed0cc1dc66d4f75cd08c6ae52d7f64ec5df` |
| 当前重放基线 SHA | `2791b86e0636cb23e777b63bae4989573beec3ac` |
| 功能分支 | `codex/requirement-promote-client` |
| 实现者 | `task_belonging_impl` |
| 审核者 | 待集成人指定 |
| 集成人 | `/root` |
| 实现 SHA | `60df6051092f5aaa75b692b61bfbac3488d6b870` |
| 会话隔离修复 SHA | `97b8f7bf6b7a73d6647e7aef19a98fc14f4fa83c` |
| 审核 SHA | 待独立审核后填写 |
| 对应服务任务 | `codex/requirement-promote-api`，服务实现 `8b1dbb5c5b1e7dd3f89e8feff96e8680947fa93e`，生命周期修复 `6475d40892b302a6319e5e52b47aa7991b27c184` 已由独立审核者批准；服务集成仍待执行 |

## 客户端设计

- API 仅调用 `POST /api/requirements/{requirement_id}/promote`，请求体只含所选象限编号，响应直接作为任务写入任务仓库。
- 客户端不会调用新建任务接口、生成任务标识或调用删除需求接口来模拟转换；需求只在服务接口成功返回后从需求仓库移除。
- 需求池卡片提供“转为任务”操作。用户在对话框选择四个象限之一并确认；提交期间按钮与选项禁用，函数入口也拒绝重复提交。
- 服务成功后，客户端写入或刷新返回任务、清除象限筛选、切回四象限矩阵并选中该任务。
- 服务失败时，需求保留在需求池，显示“转换失败，需求仍保留在需求池。请确认本地服务正常后重试。”

## 风险与门禁

- 已检查 `docs/code-audit-2026-07-21.md`。本任务引入客户端/服务端 API 契约，属于 P1：两侧独立审核通过后仍必须使用本地服务镜像进行端到端联调。
- 旧桌面数据兼容 P0 不受影响：客户端不读取、迁移、备份、覆盖或删除旧安装目录数据。
- 本任务不触及认证、发布、桌面生命周期或服务数据卷。

## 实施、审核与验证

### 实施

- `60df6051092f5aaa75b692b61bfbac3488d6b870`：将初始转换实现重放到认证已合入的客户端基线；新增服务端转换 API 接入、需求仓库成功后移除语义、服务任务写入/刷新、需求池象限选择与中文错误反馈，以及 API、仓库、视图测试。
- `97b8f7bf6b7a73d6647e7aef19a98fc14f4fa83c`：转换请求捕获需求仓库会话版本；账号切换后旧响应返回空结果，视图不再写入旧账号任务或切换新账号视图。新增 store 与视图回归覆盖。

### 独立审核

- 待集成人指定未参与实现的客户端审核者；服务端审核必须独立完成，不得以本客户端测试替代。

### 修复复核

- 如审核发现问题，由集成人指定修复者，并记录复核提交与结论。

### 验证

- `npm test -- --run src/api/index.test.ts src/stores/taskStore.test.ts src/stores/requirementStore.test.ts src/views/RequirementsView.test.ts`：通过，11/11。
- `npm test -- --run`：通过，50/50。
- `npm run build`：通过，包含类型检查与生产构建。
- `git diff --check`：通过。
- 重放与会话隔离修复后：`npm test -- --run src/api/index.test.ts src/stores/requirementStore.test.ts src/stores/taskStore.test.ts src/views/RequirementsView.test.ts`：15/15 通过；`npm run build`、`git diff --check` 通过。

### 集成

- 仅集成人可在客户端独立审核、服务端独立审核和本地服务镜像端到端联调完成后，更新功能总账、合入、推送或发布。
