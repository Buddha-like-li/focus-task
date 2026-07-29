# 报告文档本机保存与文件夹定位

## 目标与范围

- 用户目标：在“报告 -> 文档归档”中恢复文件操作。每份任务 Markdown 文档可预览、保存到本机并在资源管理器中定位；导出的汇总报告也应保存到可见的本机目录。
- 本任务仅覆盖 Windows Tauri 客户端的报告 Markdown。客户端不得使用或暴露服务响应中的 `exportPath`，因为它是 Docker 容器路径。
- 不在本任务中修改服务 API、Docker、数据卷、账号凭证、普通附件/PRD 附件的同步，或旧数据迁移。

## 可追溯性

| 字段 | 记录 |
|---|---|
| 日期 | 2026-07-29 |
| 基线 SHA | `b0933bd68276f97b968e7d68a4d39efa96878ec9` |
| 功能分支 | `codex/report-file-actions` |
| 实现者 | `report_ui_locator` |
| 审核者 | `report_api_contract_audit` |
| 集成人 | `/root` |
| 实现 SHA | `e8167945012c5ec7741c129557d04be755c8cd71` |
| 审核 SHA | `e8167945012c5ec7741c129557d04be755c8cd71`（审核的准确代码快照） |

## 设计约束

- Windows 桌面端只允许把报告写入受控的用户 Documents 目录 `Documents\Focus Task\Reports`，文件名必须在 Rust 侧清理并禁止路径穿越。
- Windows Explorer 只可定位该受控目录中的文件，绝不接受服务端或 WebView 传入的任意绝对路径。
- 浏览器开发模式没有原生文件夹命令，应继续使用 Blob 下载作为回退。
- 任务文件名必须包含稳定的任务标识，避免同名任务覆盖。

## 风险与门禁

- 已检查 `docs/code-audit-2026-07-21.md`。旧桌面数据迁移 P0 不受本功能影响：本次不读取、迁移、备份或删除任务数据，也不改变本机服务 API。
- 服务端当前不会同步远程任务的普通附件/PRD 附件；这不是报告 Markdown 本机保存能够解决的问题，保留为独立服务 P1，不得在本任务中声称已修复。
- 任何发行 tag 或 Release 仍须满足 `docs/releasing.md` 的独立发布门禁。

## 实施、审核与验证

### 实施

- 实现者新增每条任务文档的预览、下载、打开已下载文件所在文件夹三个图标；汇总报告下载也保存到同一受控目录。
- 新增 `frontend/src/utils/reportFileActions.ts` 及单测，桌面端使用 Tauri command，浏览器开发模式使用 Blob 下载回退。
- `frontend/src-tauri/src/lib.rs` 仅根据文件名在受控 Documents 子目录写入或定位文件；文件名清理覆盖路径分隔符、控制字符、Windows 保留设备名和非 Markdown 扩展名。
- 初始实现由实现者完成；审核发现 P1 后由同一实现者修复，最终实现快照为 `e8167945012c5ec7741c129557d04be755c8cd71`。

### 独立审核

- 审核者 `report_api_contract_audit` 独立确认服务端 `exportPath` 未被使用，且没有服务 API、Docker、凭证或数据变更。
- 初始审核发现 P1：文件夹按钮会重写已下载的同名 Markdown，可能覆盖用户本地编辑；另发现 P2：汇总报告下载可并发重复触发。

### 修复复核

- 修复新增 reveal-only native command：只接受文件名、在固定目录中重新解析、确认 `is_file()` 后才交给 Explorer；缺失时提示用户先下载。前端文件夹按钮在桌面端不再向 native 传 Markdown 正文。
- 汇总报告按钮同时具备 UI 禁用和函数入口 guard；单个任务的下载与定位共用 busy 状态。
- 审核者已复核修复通过，无阻塞问题。残余风险仅是待真实 Windows 安装包手工验证 Explorer `/select` 与重定向 Documents 路径。

### 验证

- `npm test -- --run`：34/34 通过。
- `npm run build`：通过。
- `cargo test`：5/5 报告文件路径相关测试通过。
- `cargo fmt --check`：通过。
- `git diff --check`：通过。
- `npx tauri build --bundles nsis`：`2.3.4` 已生成 `Focus Task_2.3.4_x64-setup.exe`，SHA-256 为 `2EE97C5003AEF6A7A762CCD9F8C7D6D3AD208587D099AD0AB785E8619844FAEF`。本机命令在签名阶段因当前 shell 未设置 `TAURI_SIGNING_PRIVATE_KEY` 返回非零；未导入私钥，最终 updater 签名仍必须由 GitHub Actions Secret 生成。

### 集成

- 集成人 `/root` 已将功能分支 fast-forward 合入 `main`，集成 SHA 为 `3c9e756fc8067cf36e2673d559016e7a4766d89a`。
- `main` 已推送至 `origin`；`v2.3.4` tag 已推送并触发 GitHub Actions 的签名 Release 工作流。
- 此记录不等待或声称 CI/Release 已完成；正式签名资产、`.sig` 与 `latest.json` 必须以 CI 结果为准。
