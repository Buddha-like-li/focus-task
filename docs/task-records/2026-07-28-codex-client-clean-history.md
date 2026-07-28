# Clean Windows Client Local Repository

## 用户目标与范围

- 把已完成的 Windows 客户端从包含遗留全栈历史的 linked worktree 中提取为独立、可审计的本地 Git 候选仓库。
- 新仓库只包含当前 Vue/Tauri Windows 客户端、Windows NSIS 发布自动化和客户端治理文档。
- 不移动、不删除、不改写 `D:\工作工具\focus-task-client` 或原始 `D:\工作工具\focus-task-main`；不触碰独立服务仓库；不推送任何远程。
- 禁止服务端源码、Docker/Compose、SQLite/数据目录、服务凭证、`.env`、镜像 tar、数据卷 tar、构建输出和旧 Git 历史进入新仓库。

## 基线与责任

- 来源工作树：`D:\工作工具\focus-task-client`。
- 来源分支与快照：`codex/client-service-split` / `2e1b6114cee5c3b9f1c1ff4fcd57ee9c656e27e6`。
- 候选仓库：`D:\工作工具\focus-task-client-clean`。
- 功能分支：`codex/client-clean-history`。
- 实现者：`/root/client_repository_implementer`。
- 审核者：待集成人指派的未参与实现者。
- 集成人：`/root`。
- Clean root 实现 SHA：`55253fbd99db0ef069fd6ffaeede4c053df5547e`（`chore: establish clean Windows client repository`）。
- 文档证据提交：本记录更新所在的后续 clean-history 提交。
- 审核 SHA / 结论：待独立审核完成后回填。

## 实现结论

- 使用来源 SHA 的 tracked snapshot 作为种子，而不是 clone、filter-repo 或复制 `.git`；因此新仓库没有遗留提交图、tag、reflog 或 `legacy-origin`。
- 仅保留 Windows 客户端源码、Windows-only release workflow、必要的 Tauri 图标/loader、许可证和当前客户端治理文档。
- 移除了候选目录中的 `.dockerignore`、Android/iOS 图标、拆分前全栈 PRD/项目图/交接文档及历史服务发布任务记录；这些资料不再构成客户端仓库事实来源。
- 新 `.gitignore` 显式拒绝服务代码、Compose、数据库、数据目录、镜像/数据 tar、凭证和构建输出。
- 新 `AGENTS.md`、功能总账和客户端审计文档将新仓库定义为待审核候选，明确 API 边界、P0 旧数据迁移门禁及禁止推送要求。

## 验证计划与当前结果

- 来源工作树 `git status --porcelain=v1`：无输出；使用的来源快照未夹带未提交文件。
- 来源工作树 `git diff --check`：通过。
- 来源索引路径扫描：未命中 `backend`、Docker/Compose、`data`、`dist`、`target`、`node_modules`、SQLite、凭证或 tar 文件。
- 候选仓库将在初始提交后执行：`git log --all --oneline`、`git remote -v`、`git status --short`、`git ls-files` 边界扫描、敏感文件名扫描、`npm test -- --run`、`npm run build`、`cargo fmt --check` 和 `git diff --check`。
- 实现者不得自行把候选仓库推送、打 tag、创建 Release 或宣布发布完成。

## 审核要求

1. 审核者必须确认 `git log --all` 只包含从上述 clean root 开始的 clean-history 提交，且没有 `legacy-origin`、旧项目提交或服务端历史。
2. 审核者必须确认 `origin` 精确指向 `git@github.com:Buddha-like-li/focus-task.git`，但本任务没有任何 push。
3. 审核者必须从 `git ls-files` 和全树文件名扫描确认没有服务代码、容器编排、数据库、数据卷、镜像 tar、`.env`、私钥、token 或账号密码。
4. 审核者必须确认 Tauri bundle target 是 Windows NSIS，发布工作流没有 macOS/Web/Docker job，客户端 API base 固定为 `http://127.0.0.1:18765`。
5. 审核者必须复跑客户端测试、production build、Rust format check 和 diff check；若对安装包边界有改动，需复跑 NSIS 构建。

## 风险与发布门禁

- **P0：旧本地任务迁移未完成独立验收。** 客户端不会碰触旧数据；没有服务迁移任务的独立证据时，禁止宣称旧任务可见或发布该兼容能力。
- **P1：候选仓库尚未独立审核。** 未审核前禁止合入、推送、tag 和 Release。
- **P1：签名私钥和任何服务测试账号均不得进入本仓库。** GitHub secrets 和服务运行时配置由集成人/运维单独管理。
