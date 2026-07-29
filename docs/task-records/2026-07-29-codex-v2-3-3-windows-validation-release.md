# v2.3.3 Windows Validation Release

## 用户目标与范围

- 用户于 2026-07-29 书面要求触发 Windows 客户端发布，以便下载、安装并验证其本机
  Focus Task 服务是否正常。
- 本任务只发布 Windows NSIS 客户端及 updater manifest；不发布服务镜像、数据卷、
  数据库、账号密码或任何服务端源码。
- 本任务不宣称旧安装目录数据会自动迁移，也不替代后续客户端/服务端端到端验收。

## 基线与责任

- 发布基线与功能分支：`main` / `322add87b3f7bde4ec2155262d5815f547517489`。
- 目标版本与 tag：`2.3.3` / `v2.3.3`。
- 实现者：无新增产品代码；发布目标为已审核的 clean Windows 客户端。
- 发布前审核者：`/root/release_preflight_reviewer`（未参与实现或发布）。
- 审核对象 SHA：`322add87b3f7bde4ec2155262d5815f547517489`。
- 集成人与发布执行者：`/root`。

## 发布前验证

- 三处版本一致：`frontend/package.json`、`frontend/src-tauri/tauri.conf.json` 与
  `frontend/src-tauri/Cargo.toml` 均为 `2.3.3`。
- `git status --short` 无输出；GitHub remote 仅有 `main`，无 tag、无 Release。
- `TAURI_SIGNING_PRIVATE_KEY` 已配置为 GitHub Repository secret；私钥未加密码时，
  不设置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 是正确配置。secret 值不读取、不复制、
  不进入工作树或日志。
- 发布工作流只在推送 `v*.*.*` tag 时创建 Release，预期资产为
  `Focus.Task_2.3.3_x64-setup.exe`、同名 `.sig` 与 `latest.json`。
- 本地服务只读验证：`GET http://127.0.0.1:18765/api/health` 返回 200；
  容器 `focus-task-service-api` 为 healthy，使用导入数据卷
  `focus-task-service-imported-data-r13-final`。客户端发布不会修改服务容器或数据卷。

## 风险、延期与发布批准

- **P0 受控测试例外：旧桌面数据兼容。** 用户明确要求本次发布用于下载安装及
  本地服务验证。该授权只允许 Windows 客户端测试发布，不代表“旧任务自动兼容”
  已被宣称为完成。服务 `.7`/r13 导入与 bootstrap 防护已有独立运行时证据；用户
  安装后仍须核对登录与任务读取结果。
- **P1 延期：客户端/服务端端到端联调。** 负责人为 `/root`；后续在
  `codex/client-service-e2e-validation` 独立分支记录安装后的登录、任务读取、附件及
  错误恢复验证。触发条件为用户完成本次安装测试并反馈结果。
- **P1 验证：updater 签名与 manifest。** 负责人为 `/root`。本次 CI 是首次针对新
  GitHub 仓库验证私钥、公钥、NSIS `.sig`、canonical 资产名与 `latest.json` 的完整
  链路；CI 结果完成前不得宣称 Release 可用。任一失败必须在独立
  `codex/v2-3-3-release-signature-fix` 分支修复、由未参与实现者复核，并由集成人
  记录验收结论。
- 集成人发布批准：基于用户书面测试授权、独立预检结论和本机服务健康检查，允许
  先推送 `v2.3.3` tag；CI pending/failed 期间不得宣称 Release 可用，结果必须如实
  记录。

## 发布后验收

- CI 成功后，核对 Release 资产、`latest.json` 的 Windows URL 与 `.sig` 是否一致。
- 用户安装后验收本地服务连接、登录和任务读取；安装/运行日志作为后续 P1 联调证据。
- CI 或安装失败时，在新的独立分支创建修复任务并由未参与实现者复核。
