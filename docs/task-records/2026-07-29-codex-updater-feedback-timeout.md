# 更新检查与安装反馈修复

## 目标与范围

- 用户目标：设置页的后台检查不能长期显示“检查中”；手动检查应能在后台检查超时后立即重试。发现新版本后点击“立即更新”必须显示正在连接、下载或安装的状态，失败必须直接显示可读原因。
- 本任务仅修改 Windows 客户端的 Vue/Tauri updater 状态机、超时、进度、日志和界面反馈。
- 不修改服务 API、Docker、数据卷、任务数据、账号凭证、签名私钥或 Release 资产命名。

## 已验证事实

- `v2.3.4` Release、签名和 `latest.json` 均已由 GitHub Actions `30418166272` 成功发布。
- 用户点击“立即更新”后，本机 `D:\桌面\工作工具\Focus Task\focus-task.exe` 已实际变为 `2.3.4` 并重启；问题是安装过程没有可见反馈。
- 本机日志记录过 15 秒 silent updater timeout；网络波动时点击安装会再次无超时请求 manifest，且错误只写日志，形成“无反应”体验。

## 可追溯性

| 字段 | 记录 |
|---|---|
| 日期 | 2026-07-29 |
| 基线 SHA | `33dba2e8bb77b5e7a5d1467f998a2b40d4622ef1` |
| 功能分支 | `codex/updater-feedback-timeout` |
| 实现者 | `updater_fix_impl` |
| 审核者 | `updater_code_reviewer`；发布链独立审核：`release_artifact_audit` |
| 集成人 | `/root` |
| 实现 SHA | `7cf9208ea6445f101080bdf195f09e70817024b5` |
| 审核 SHA | `2a9e905ad853d54e600a6d6d162db0a5ded1ce5a`（审核的准确代码快照） |

## 风险与门禁

- 已检查客户端审计中的 Release 签名门禁。本任务不改变签名配置、updater public key、Release 资产命名或 API 契约；任何新 tag 仍须经独立审核、测试和 Release 工作流验证。
- 已发布的 `v2.3.4` 不受回退或重写影响。该补丁只能通过新的 patch 版本交付。
- 旧桌面数据迁移 P0 不受本任务影响：本次不读取、备份、迁移、覆盖或删除任务数据，也不声明旧任务自动兼容。用户在当前任务中已明确授权完成并发布该 Windows updater 补丁。
- 本地服务 API P1 不受本任务影响：客户端仍只访问 `http://127.0.0.1:18765`，未变更认证、任务、附件、报告或团队接口。

## 实施、审核与验证

### 实施

- `7cf9208` 将启动静默检查与设置页手动检查的 UI 状态分离；静默检查不再占用“检查中”按钮状态。Tauri 原生 `check({ timeout: 15000 })` 失败后会清理 in-flight 请求，使后续手动检查发起新的原生请求。
- 成功检查得到的 `Update` 原生资源会被缓存并直接用于“立即更新”，不再发起第二次 manifest 请求；替换、消费或失败后的资源按生命周期释放。
- 安装使用 Tauri 原生下载 timeout `300000`，而非 JavaScript 超时包装。它会显示连接、下载、安装和重启状态，使用 `Started.contentLength` 与 `Progress.chunkLength` 计算真实下载进度，并把可读错误显示在当前弹窗及写入 `frontend.log`。
- 两个更新入口均禁止重复安装或安装中关闭弹窗；新增覆盖静默/手动重试、缓存复用、资源释放、并发去重、下载进度与错误展示的单元测试。

### 独立审核

- `updater_code_reviewer` 独立复核 `7cf9208`：确认静默/手动检查隔离、Tauri 2.10.1 原生 timeout、`Update` 资源释放、并发安装去重、下载进度与弹窗错误反馈正确；无 P0/P1 行为问题。
- `release_artifact_audit` 独立复核 updater/release 边界：确认公钥、Release 配置和 `latest.json` canonical 资产命名未改动，与 `v2.3.3` 至 `v2.3.4` 的 updater 兼容；无阻塞问题。

### 修复复核

- 初审发现 P2：两处注释错误描述为 plugin 自动重启，但实际正确路径是显式调用 `relaunch()`。实现者以 `2a9e905` 更正注释；`updater_code_reviewer` 已复核该修订不改变行为并通过。

### 验证

- `npm test -- --run`：36/36 通过（实现者与集成人独立复跑）。
- `npm run build`：通过（实现者与集成人独立复跑）。
- `cargo fmt --check`：通过。
- `cargo test`：5/5 通过。
- `git show --check`、`git diff --check`：通过。
- `npx tauri build --bundles nsis`：已生成 `frontend/src-tauri/target/release/bundle/nsis/Focus Task_2.3.5_x64-setup.exe`。当前终端未导入 `TAURI_SIGNING_PRIVATE_KEY`，因此在生成安装包后按预期报告签名私钥缺失；私钥未写入工作树，最终 signed `.sig` 与 `latest.json` 仍由 GitHub Actions Repository Secret 生成。

### 集成

待集成人完成 Windows NSIS 验证、fast-forward 合入 `main`、创建 `v2.3.5` tag 并推送后回填。
