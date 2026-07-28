# Focus Task Windows 客户端功能总账

> 本文档记录当前独立 Windows 客户端仓库的运行时能力、来源快照、验证证据和已知限制。它不记录服务端源码、镜像、数据库或部署实现；服务端事实只在独立本地服务仓库中保存。

## 仓库与事实边界

- 当前仓库是一个经独立审核的本地 Git 候选仓库，工作内容来自 `D:\工作工具\focus-task-client` 的 Windows 客户端快照 `2e1b6114cee5c3b9f1c1ff4fcd57ee9c656e27e6`。
- 旧项目的提交图、tag、`legacy-origin`、服务端源码、Docker/Compose、SQLite 数据、数据卷归档、镜像 tar 和凭证均不在本仓库可达历史或索引中。
- 本仓库只面向 Windows 11。Vue/Tauri 客户端固定访问 `http://127.0.0.1:18765`；任务和账户等业务数据以本机服务 API 为唯一来源。
- clean root commit 是 `55253fbd99db0ef069fd6ffaeede4c053df5547e`，独立审核对象为 `5bb37999f33a532176cca426e23b878550f6cd1`；2026-07-28 已在用户书面授权下将干净 `main` 推送至 GitHub。未打 tag、未创建 Release。详见 [clean-history 任务记录](task-records/2026-07-28-codex-client-clean-history.md)。

## 当前客户端能力

| 能力 | 用户可见行为 | 运行时代码/测试证据 | 状态 |
|---|---|---|---|
| 登录与会话 | 用户可注册、登录和退出；登录态仅使用 Windows Credential Manager，不回退到 WebView `localStorage`。 | `frontend/src/stores/authStore.ts`、`frontend/src/utils/secureStorage.ts`、`frontend/src-tauri/src/lib.rs`、`frontend/src/stores/authStore.test.ts`、`frontend/src/utils/secureStorage.test.ts` | 当前源码包含 |
| 任务工作台 | 四象限、今日、已完成、汇总视图；任务详情、状态、日期、优先级、子任务、重复和提醒偏好。 | `frontend/src/views/MatrixView.vue`、`TodayView.vue`、`DoneView.vue`、`SummaryView.vue`、`frontend/src/stores/taskStore.ts` | 当前源码包含 |
| 内容与文件 | 任务 Markdown、普通附件、PRD 附件，以及日报/周报/月报的预览和下载。 | `frontend/src/components/ContentModal.vue`、`DetailPanel.vue`、`frontend/src/api/index.ts` | 当前源码包含 |
| 协作界面 | 需求池、关联任务、团队、邀请、角色、成员只读任务视图、评论和任务转交界面。 | `frontend/src/views/RequirementsView.vue`、`TeammatesView.vue`、`frontend/src/stores/requirementStore.ts`、`teamStore.ts` | 当前源码包含；服务 API 契约须联调 |
| Windows 体验 | Windows 通知、错误日志落盘、安装包内 WebView2 loader、应用内更新检查。 | `frontend/src/utils/notifications.ts`、`frontend/src/composables/useAppLogger.ts`、`useAppUpdate.ts`、`frontend/src-tauri/src/lib.rs`、`.github/workflows/release.yml` | 当前源码包含 |
| 服务不可用反馈 | 本机服务不可达时显示明确连接信息；恢复服务后可重新加载。 | `frontend/src/api/base.ts`、`frontend/src/views/AppLayout.vue`、`frontend/src/views/AppLayout.test.ts` | 当前源码包含 |

## 客户端/服务边界

- 客户端不内嵌、启动、停止、配置或重启后端进程。
- 客户端不包含服务端源码、容器编排、镜像、SQLite 文件、数据卷归档或服务账号密码。
- 客户端不维护离线任务副本、不执行远端同步队列，也不访问旧版本安装目录。
- 报告以服务 API 返回的下载内容交给 Windows 用户；客户端不把容器内路径作为本机文件路径打开。
- API 字段、认证或附件行为变化时，必须在客户端和服务端分别建立任务记录，并由集成人完成联调验收。

## 验证证据

- 来源工作树在建立本仓库前无未提交改动，来源 SHA 为 `2e1b611`。
- 来源工作树的已记录客户端验证包括 `npm test -- --run`（25 项）、`npm run build`、`cargo fmt --check` 与 `git diff --check`；真实 NSIS 安装包已在 Windows 构建环境产生。
- clean-history 已完成独立索引边界扫描、Git 历史/remote 核对和客户端代码审核：25 项前端测试、production build、Rust format check、diff check 和实际 NSIS bundle 均通过。NSIS SHA-256 为 `D9F18F8D2D38112E06FFAE6FB9B23F7EB790F28FA5628F00274E88405654BF7E`。

## 已知风险与门禁

| 优先级 | 风险或限制 | 当前状态与要求 |
|---|---|---|
| P0 | 旧桌面数据兼容。 | 客户端不会迁移、覆盖、备份或删除旧数据。服务端导入和 bootstrap 防护已在受控本地 `.7`/r13 交付中独立复核并运行时证明，保留 3 用户、18 任务和 61 快照；正式服务器部署仍受服务端 P1 密钥挂载改造约束。 |
| P1 | 新客户端与本地服务的 API 契约尚需端到端验收。 | 任何服务镜像、认证、附件或数据迁移变化都要在两个仓库建立对应任务记录并联调。 |
| P1 | GitHub remote 仍有一个旧全栈默认分支。 | 用户已书面授权远程清理；干净 `main` 已强制推送，12 个非默认旧分支已删除。当前命令行账号仅有 push 权限，不能把默认分支从 `feat/phase5-subtasks-bugs-prd` 切为 `main`，因此该旧默认分支仍可达。仓库管理员完成切换并删除该分支后才算客户端-only remote。 |
| P1 | GitHub updater 需要可用的现有签名私钥及其密码。 | 不得把私钥或密码写入工作树、Git 历史、镜像或日志；仅由集成人在 GitHub repository secrets 配置。 |
| P1 | 本地 NSIS bundle 未生成 `.sig`。 | 私钥密码不可用时，不能验证 updater/tag Release；本地安装包验收不受影响。 |
| P2 | `frontend.log` 还没有容量上限或轮转策略。 | 建立独立客户端修复任务后处理，并在功能总账更新结论。 |

## 发布状态

- 当前版本源文件仍标记为 `2.3.3`，这仅是来源快照的应用版本，不表示本 clean-history 仓库已发布 `v2.3.3`。
- 任何下一次 tag 必须在集成人确认版本、签名配置、独立审核和客户端/服务联调后创建；当前签名私钥密码不可用，不能创建 updater Release。
- 远程 `main` 已是干净客户端 history；GitHub 仍以旧 `feat/phase5-subtasks-bugs-prd` 作为默认分支。管理员须先切换默认分支到 `main`，再删除旧分支；在此之前不创建 tag 或 Release。
- 服务镜像和可选数据卷归档均由服务仓库交付；它们永远不是本客户端 GitHub Release 的资产。
