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
| 实现 SHA | 待实现提交后回填 |
| 审核者 | 待指派 |
| 审核 SHA | 待审核后回填 |

## 风险与门禁

- 已检查客户端审计中的发布签名门禁。本任务不修改签名私钥、updater 公钥、Release 资产名、API 契约或用户数据。
- 新版本 tag 仍必须经过独立审核、版本递增、完整验证和集成人批准；本任务的说明来源与校验不构成发布授权。
- 旧桌面数据兼容 P0 与客户端/服务 API 契约 P1 均不受本任务影响。

## 实施、审核与验证

### 实施

- 在 `AGENTS.md` 固化用户可见 Release 标题、正文和桌面更新说明使用中文的规则；`docs/release-notes/` 是严格的纯用户说明来源，不包含英文、技术资产名、命令、路径或协议地址。
- 新增 `docs/release-notes/v2.3.5.md`，准确记录更新检查状态、安装反馈和下载进度修复；该文件只作为集成人受控修正既有 Release 的来源，本实现不调用发布命令。
- 新增 `docs/release-notes/v2.3.6.md`，记录中文发布说明与桌面更新说明统一展示的变更。
- 新增 `scripts/validate-release-notes.sh`，拒绝缺失、空白或含英文 ASCII 字母的版本说明。
- 发布工作流在签名预检阶段先校验版本说明，使不合规说明在 Windows 构建前失败；Release 正文与 `latest.json` 的 `notes` 都直接读取同一文件，后续两个步骤保留防御性重复校验。

### 独立审核

- 待独立审核者回填。

### 修复复核

- 如审核发现问题，待修复和复核后回填。

### 验证

- `bash scripts/validate-release-notes.sh docs/release-notes/v2.3.5.md`：通过。
- `bash scripts/validate-release-notes.sh docs/release-notes/v2.3.6.md`：通过。
- `bash scripts/validate-release-notes.sh AGENTS.md`：按预期因英文 ASCII 字母失败。
- `bash scripts/validate-release-notes.sh frontend/node_modules/nwsapi/dist/lint.log`：按预期因空文件失败。
- `python -c "import yaml; ..."`：成功解析 `.github/workflows/release.yml`，并确认 Windows 构建继续依赖签名预检。
- `git diff --check`：通过。
