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
| 登录与会话 | 桌面端登录成功后以当前 Windows 用户绑定的本机加密会话仓保存令牌和用户名，不保存明文密码；重新打开可恢复最近账号。用户名输入框可选择最多 8 个已记住账号，有效会话可直接恢复，失效会话保留用户名并要求重新输入密码。设置页区分切换账号、退出并清除当前会话、移除本机账号；旧账号的延迟响应不能覆盖新账号。 | `frontend/src/stores/authStore.ts`、`frontend/src/utils/secureStorage.ts`、`frontend/src/views/LoginView.vue`、`frontend/src/views/SettingsView.vue`、`frontend/src-tauri/src/lib.rs`、`frontend/src/stores/authStore.test.ts`、`frontend/src/utils/secureStorage.test.ts`、`frontend/src/views/LoginView.test.ts`、`frontend/src/views/SettingsView.test.ts`、`docs/task-records/2026-07-30-codex-auth-resilient-session-selector.md`、`docs/task-records/2026-07-30-codex-auth-account-selector-frontend.md` | 已独立审核，待 v2.3.9 发布 |
| 任务工作台 | 四象限、今日、已完成、汇总视图；任务详情、状态、日期、优先级、子任务、重复和提醒偏好。 | `frontend/src/views/MatrixView.vue`、`TodayView.vue`、`DoneView.vue`、`SummaryView.vue`、`frontend/src/stores/taskStore.ts` | 当前源码包含 |
| 自定义任务归属 | 任务详情的“任务归属”可自由输入或从建议中选择；空白值统一为“项目管理”，保存期间会串行化，避免快速修改的失败回滚覆盖后续值。 | `frontend/src/components/DetailPanel.vue`、`frontend/src/components/DetailPanel.test.ts`、`frontend/src/stores/taskStore.ts`、`docs/task-records/2026-07-29-codex-task-belonging-custom-input.md` | 已审核合入，随 v2.3.8 发布 |
| 需求池转四象限任务 | 需求池卡片可选择四个象限并转换为任务。成功后任务进入四象限工作台并选中；失败时需求保留。账号切换期间旧转换响应不会写入新账号。 | `frontend/src/views/RequirementsView.vue`、`frontend/src/stores/requirementStore.ts`、`frontend/src/api/index.ts`、`frontend/src/views/RequirementsView.test.ts`、`frontend/src/stores/requirementStore.test.ts`、`docs/task-records/2026-07-29-codex-requirement-promote-client.md`；对应本地服务合入 `1e3c010` | 已审核合入，随 v2.3.8 发布 |
| 内容与文件 | 任务 Markdown、普通附件、PRD 附件，以及日报/周报/月报的预览和下载。 | `frontend/src/components/ContentModal.vue`、`DetailPanel.vue`、`frontend/src/api/index.ts` | 当前源码包含 |
| 报告文档本机文件操作 | 文档归档中的每份任务 Markdown 可预览、保存到 Windows 本机，并可首次直接保存后定位到所在文件夹；同名用户手工编辑的文件不会被后续定位操作覆盖。汇总报告同样保存到可见目录。桌面端目录为 `Documents\Focus Task\Reports`，浏览器开发模式退回普通下载。 | `frontend/src/views/ReportsView.vue`、`frontend/src/utils/reportFileActions.ts`、`frontend/src/views/ReportsView.test.ts`、`frontend/src-tauri/src/lib.rs`、`docs/task-records/2026-07-29-codex-report-open-local-file.md` | 已审核合入，随 v2.3.8 发布 |
| 协作界面 | 需求池、关联任务、团队、邀请、角色、成员只读任务视图、评论和任务转交界面。 | `frontend/src/views/RequirementsView.vue`、`TeammatesView.vue`、`frontend/src/stores/requirementStore.ts`、`teamStore.ts` | 当前源码包含；服务 API 契约须联调 |
| 页面布局与长文本适配 | 登录、四象限、需求池、报告、设置、团队和内容详情在窄窗口、长标题、长用户名、长标签和多日期图表下保持可读、可滚动和可操作；右键菜单会按实际尺寸留在可视区域内。 | `frontend/src/views/AppLayout.vue`、`ReportsView.vue`、`RequirementsView.vue`、`SettingsView.vue`、相关组件及四份 `codex-ui-polish` 任务记录 | 已独立审核合入，随 v2.3.8 发布 |
| Windows 体验 | Windows 通知、错误日志落盘、安装包内 WebView2 loader、应用内更新检查。静默检查不会占用手动“检查中”状态；更新弹窗显示连接、下载、安装、重启或失败原因。 | `frontend/src/utils/notifications.ts`、`frontend/src/composables/useAppLogger.ts`、`frontend/src/composables/useAppUpdate.ts`、`frontend/src/composables/useAppUpdate.test.ts`、`frontend/src-tauri/src/lib.rs`、`.github/workflows/release.yml` | `v2.3.5` 已公开发布 |
| 中文发布与更新说明 | GitHub Release 标题、正文、更新清单和桌面端更新弹窗共用同一份中文说明；发布前会拒绝空白或含英文的用户说明。 | `docs/release-notes/`、`scripts/validate-release-notes.sh`、`.github/workflows/release.yml`、`frontend/src/composables/useAppUpdate.ts`、`frontend/src/views/SettingsView.vue`、`frontend/src/views/AppLayout.vue` | `v2.3.6` tag 已推送，签名 CI 待完成 |
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
- 2026-07-29 发布前核对 GitHub remote：仅有 `refs/heads/main`；当时无 tag、无 Release。旧全栈 refs 不再可达。
- `v2.3.3` Windows 验证发布已成功：GitHub Actions run `30414523317` 的签名预检、Windows
  构建、Release notes 与 updater manifest 全部通过。公开 Release 包含
  `Focus.Task_2.3.3_x64-setup.exe`、同名 `.sig` 与 `latest.json`；manifest 的
  `windows-x86_64` URL 指向该 canonical 安装包。公开 `.exe` 已由客户端 updater
  公钥和 `minisign-verify` 验证签名。详见
  `task-records/2026-07-29-codex-v2-3-3-windows-validation-release.md`。
- `v2.3.4` 已完成独立实现、审核和修复复核：前端 34/34、production build、Rust 5/5、format/diff 检查均通过；本机 NSIS 已生成。`main` 与 tag 已推送，GitHub Actions `30418166272` 已公开签名 Release、`.sig` 与 `latest.json`，详见 `task-records/2026-07-29-codex-report-file-actions.md`。
- `v2.3.5` updater 反馈修复已完成独立实现和双重独立审核并 fast-forward 合入、推送 `main`：前端 36/36、production build、Rust 5/5、format/diff 检查均通过；`Focus Task_2.3.5_x64-setup.exe` 已本地生成。静默检查不再占用设置页手动状态，手动重试使用新的原生 timeout 请求，安装反馈与失败信息在当前弹窗可见。tag 已推送，详见 `task-records/2026-07-29-codex-updater-feedback-timeout.md`。
- `v2.3.6` 中文发布与更新说明已完成独立实现与审核：实现提交为 `1329607`，审核未发现 P0/P1；中文说明的正例、英文/空白反例、工作流解析、前端 36/36、production build 和 diff 检查均通过。`main` 与 tag 已推送，详见 `task-records/2026-07-29-codex-chinese-release-notes.md`。
- 既有 `v2.3.5` 已在不移动 tag、不替换安装包或签名的前提下修正 Release 标题、正文和 `latest.json.notes`；远程复核确认仍指向原有 Windows 安装包。
- v2.3.8 将汇总此前未打 tag 的登录持久化、任务归属、需求转任务和本机报告文件动作，并加入已审核的页面布局与长文本优化；只构建 Windows 客户端，不改变本地服务、用户数据或 API 契约。发布前验证、书面例外和推送证据见 `task-records/2026-07-29-codex-v2-3-8-ui-polish-release.md`。
- v2.3.9 修复桌面端登录状态保存失败：客户端不再使用失效的凭据管理器依赖，改用当前 Windows 用户范围的本机加密多账号会话仓。集成验证为前端 83/83、Rust 15/15、生产构建、格式和差异检查；本地 NSIS 安装包已生成。详细证据见 2026-07-30 的认证任务记录与发布任务记录。

## 已知风险与门禁

| 优先级 | 风险或限制 | 当前状态与要求 |
|---|---|---|
| P0 | 旧桌面数据兼容。 | 客户端不会迁移、覆盖、备份或删除旧数据。服务端导入和 bootstrap 防护已在受控本地 `.7`/r13 交付中独立复核并运行时证明，保留 3 用户、18 任务和 61 快照；本次 Windows 验证发布的书面例外只允许安装并验证本机服务，不得宣称旧任务自动兼容，详见 `task-records/2026-07-29-codex-v2-3-3-windows-validation-release.md`。 |
| P1 | 新客户端与本地服务的 API 契约尚需端到端验收。 | 任何服务镜像、认证、附件或数据迁移变化都要在两个仓库建立对应任务记录并联调。 |
| P2 | `frontend.log` 还没有容量上限或轮转策略。 | 建立独立客户端修复任务后处理，并在功能总账更新结论。 |
| P2 | 已退出且无有效会话的账号名没有单独的选择页移除入口。 | 可选择该账号后重新登录，再在设置页移除；后续可建立独立账号管理界面任务。 |
| P2 | 原凭据管理器遗留会话不迁移或主动清理。 | v2.3.9 首次升级需重新登录一次；新版本不会读取或使用遗留会话。 |

## 发布状态

- `v2.3.3` 已作为 Windows 本地服务验证发布；公开 Release、`.sig` 与 `latest.json` 已由 CI 成功生成，但用户安装后的登录与任务读取联调尚待记录。
- `v2.3.4` 已作为报告文档本机保存与文件夹定位补丁公开发布；签名 Release、`.sig` 与 `latest.json` 已由 GitHub Actions `30418166272` 成功生成。
- `v2.3.5` 是 Windows updater 体验修复版，已合入 `main`、推送并完成公开签名 Release；其 Release 标题、正文与更新清单说明已修正为中文。本地 NSIS 已验证。它不改变客户端/服务边界、服务 API、数据卷或旧任务兼容承诺。
- `v2.3.6` 是中文发布与更新说明统一版：最终验证已完成，tag 已推送并触发签名 CI；CI 成功前不得宣称公开 Release 已可用。它不改变客户端/服务边界、服务 API、数据卷或旧任务兼容承诺。
- `v2.3.9` 是桌面端加密多账号登录状态修复版：已完成独立实现、审核和整合验证，待集成人创建 tag 并推送后由签名工作流生成 Windows 安装包与更新清单。它不改变本地服务 API、用户任务数据、容器或旧任务兼容承诺。
- 任何下一次 tag 必须在集成人确认版本、签名配置、独立审核和客户端/服务联调后创建；密码只在私钥加密时需要。
- 远程分支只保留干净客户端 `main`；该客户端/服务边界不随本 Release 改变。
- 服务镜像和可选数据卷归档均由服务仓库交付；它们永远不是本客户端 GitHub Release 的资产。
