# Focus Task Windows 客户端审计边界

> 原始 2026-07-21 审计覆盖了拆分前的全栈仓库。本文件保留当前 Windows 客户端需要继续执行的风险门禁；服务端实现、迁移和容器风险不复制到客户端仓库。

## 审计范围

- Vue 3 前端、Tauri Windows 壳、Windows NSIS 发布工作流和客户端治理文档。
- 本地服务 HTTP 契约仅作为外部依赖核对，不在本仓库实现服务端逻辑。
- 本仓库只允许 Windows 发布；不恢复 Web、macOS、Linux 或移动端交付。

## P0

### 旧桌面数据与新服务数据源尚未完成可发布的迁移验收

- 客户端不会读取、备份、迁移或删除旧安装目录数据，这是有意的隔离边界。
- 旧任务能否导入新服务只能由独立服务仓库中的迁移任务证明，并由独立审核者复核源数据不变、导入校验、失败回滚和数据卷交付。
- 在该证据完成前，客户端不得以“旧任务自动兼容”名义打 tag 或发布。任何例外必须记录在任务记录中并由集成人书面批准。

## P1

### 客户端与服务 API 契约需要共同验收

- 固定 API origin 是 `http://127.0.0.1:18765`，但认证、任务、附件、报告、团队和需求接口依赖独立服务镜像。
- 客户端或服务任一侧改变 API 字段、认证、错误格式、上传下载或持久化语义时，必须各自建立分支和任务记录，并执行联调。
- 服务不可用时，客户端必须保留可读错误和重新连接路径，不得回退读取旧本地 SQLite 或启动内嵌后端。

### 发布签名与远程发布仍是受控操作

- 本地 NSIS 构建不等同于可发布 updater。正式 tag 必须有匹配现有公钥的 `TAURI_SIGNING_PRIVATE_KEY` 与密码，并由 CI 产生签名、canonical Windows 资产和 `latest.json`。
- 私钥、密码、GitHub token、服务凭证、镜像 tar 和数据卷 tar 不得进入工作树、索引、提交、Release 附件或日志。
- 当前 clean-history 候选尚未独立审核，禁止推送、tag 或 Release。

## P2

### 前端落盘日志尚无轮转

- `frontend.log` 可用于定位客户端错误，但没有明确容量上限或轮转策略。
- 必须以独立客户端任务实现大小限制、保留策略和必要的脱敏测试；不要在本 clean-history 任务中混入该功能改动。

## 独立审核最低检查

1. 核对可达 Git 历史仅包含从 clean-history root commit `55253fbd99db0ef069fd6ffaeede4c053df5547e` 开始的本任务提交，且只配置 `origin`。
2. 扫描索引中不存在 `backend/`、Docker/Compose、SQLite/数据目录、镜像/数据 tar、`.env`、密钥、token 或服务账号密码。
3. 核对 `tauri.conf.json` 与 Release 工作流仅构建 Windows NSIS，并且 API origin 仍为 `http://127.0.0.1:18765`。
4. 复跑 `npm test -- --run`、`npm run build`、`cargo fmt --check`、`git diff --check` 和相应 NSIS 构建。
5. 将审核 SHA、结论和任何修复复核回填到任务记录及功能总账；只有集成人可以决定合入或推送。
