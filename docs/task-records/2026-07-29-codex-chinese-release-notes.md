# 中文发布与更新说明

## 用户目标与范围

- 用户要求所有面向用户的发布与更新说明均使用中文，并让桌面端更新页展示与发布页对应的说明内容。
- 本任务仅建立中文更新说明的受控来源、发布流程与校验规则；不修改服务端、凭证、签名、公钥、资产命名、历史 tag 或已发布 Release。
- 已发布 `v2.3.5` 的中文说明文件只作为集成人后续受控修正 GitHub Release 正文、标题和 `latest.json` 内容的来源；实现阶段不得调用发布命令或改写既有 Release。

## 可追溯性

| 字段 | 记录 |
|---|---|
| 日期 | 2026-07-29 |
| 基线 SHA | `cd274e26b2756d4df51bd3cb8263b26fb4439909` |
| 功能分支 | `codex/chinese-release-notes` |
| 实现者 | `chinese_release_notes_impl` |
| 集成人 | `/root` |
| 实现 SHA | `13296076460faabc52f4e146f5c33351ab633631` |
| 审核者 | `chinese_release_notes_review` |
| 审核 SHA | `13296076460faabc52f4e146f5c33351ab633631`（以实现提交为独立审核对象，未产生额外代码提交） |

## 风险与门禁

- 已检查客户端审计中的发布签名门禁。本任务不修改签名私钥、updater 公钥、Release 资产名、API 契约或用户数据。
- 新版本 tag 仍必须经过独立审核、版本递增、完整验证和集成人批准；本任务的说明来源与校验不构成发布授权。
- **P0 受控发布例外：旧桌面数据兼容。** 用户已明确要求交付并发布此 Windows 客户端更新；本例外仅允许发布中文 Release/更新说明与对应客户端安装包，不读取、备份、迁移、覆盖或删除任务数据，也不宣称旧任务已自动兼容。
- **P1 延期：客户端/服务 API 契约。** 本任务不变更 API origin、认证、任务、附件、报告或团队接口；`/root` 继续负责后续独立客户端/服务联调任务，详见功能总账中的 P1 记录。

## 实施、审核与验证

### 实施

- 在 `AGENTS.md` 固化用户可见 Release 标题、正文和桌面更新说明使用中文的规则；`docs/release-notes/` 是严格的纯用户说明来源，不包含英文、技术资产名、命令、路径或协议地址。
- 新增 `docs/release-notes/v2.3.5.md`，准确记录更新检查状态、安装反馈和下载进度修复；该文件只作为集成人受控修正既有 Release 的来源，本实现不调用发布命令。
- 新增 `docs/release-notes/v2.3.6.md`，记录中文发布说明与桌面更新说明统一展示的变更。
- 新增 `scripts/validate-release-notes.sh`，拒绝缺失、空白或含英文 ASCII 字母的版本说明。
- 发布工作流在签名预检阶段先校验版本说明，使不合规说明在 Windows 构建前失败；Release 正文与 `latest.json` 的 `notes` 都直接读取同一文件，后续两个步骤保留防御性重复校验。

### 独立审核

- 审核者独立确认发布说明校验在 Windows 构建之前执行，避免不合规文案消耗 Windows 构建资源。
- 审核者独立确认 GitHub Release 正文与 `latest.json` 的 `notes` 直接读取同一份版本说明；桌面端设置页和主界面更新弹窗均直接展示 updater 返回的说明正文。
- 审核未发现 P0/P1 问题，且未改动签名私钥、公钥、Release 资产名、服务 API 或用户数据。

### 修复复核

- 最终独立审核未发现需修复的问题；无后续修复提交，复核不适用。

### 验证

- `bash scripts/validate-release-notes.sh docs/release-notes/v2.3.5.md`：通过。
- `bash scripts/validate-release-notes.sh docs/release-notes/v2.3.6.md`：通过。
- `bash scripts/validate-release-notes.sh AGENTS.md`：按预期因英文 ASCII 字母失败。
- `bash scripts/validate-release-notes.sh frontend/node_modules/nwsapi/dist/lint.log`：按预期因空文件失败。
- `python -c "import yaml; ..."`：成功解析 `.github/workflows/release.yml`，并确认 Windows 构建继续依赖签名预检。
- `npm test -- --run`：36/36 通过。
- `npm run build`：通过。
- `git diff --check`：通过。

### 集成验证

- 集成人在版本号同步为 `2.3.6` 后复跑 `npm test -- --run`，12 个测试文件、36 个测试全部通过；`npm run build`、`cargo fmt --check`、`cargo test`（Rust 5/5）和 `git diff --check` 均通过。
- 集成人复跑两份中文说明正例、英文反例和发布工作流结构校验，结果均符合预期。
- `npx tauri build --bundles nsis` 已生成本地 Windows 安装包 `Focus Task_2.3.6_x64-setup.exe`。本机没有读取或设置签名私钥，因此 updater 签名步骤按预期停止；该结果不改变 GitHub Actions 使用 Repository Secret 完成正式签名的发布责任。

### 最终集成审核

- `release_integration_review` 独立复核了待提交的版本同步与治理记录：五处版本元数据和本地安装包版本均为 `2.3.6`，中文规则、任务记录和功能总账均符合门禁。
- 该复核未发现 P0/P1/P2，确认未触及服务端、API、Docker、凭证、签名私钥或公钥、用户数据；复跑中文说明正反例、工作流结构、前端 36/36、生产构建、Rust 5/5、格式和差异检查均通过。

### 已发布版本修正

- 集成人已将既有 `v2.3.5` 的 GitHub Release 标题和正文替换为 `docs/release-notes/v2.3.5.md` 中的中文说明，并将其 `latest.json` 的 `notes` 替换为同一内容。
- 远程复核确认更新清单版本仍为 `2.3.5`，且 Windows 安装包地址仍指向原有 `Focus.Task_2.3.5_x64-setup.exe`；未替换安装包、签名或 tag。

### 发布执行

- `main` 已推送至 `d903eda67660cd081399e39263f602b540be8d19`，带注释 tag `v2.3.6` 已推送并指向该提交。
- 按用户要求，tag 推送成功后不等待 GitHub Actions 完成。CI 成功前不得宣称 `v2.3.6` 的签名安装包、签名文件和公开 Release 已可用；任一失败均须在新的独立分支修复并复核。
