# Windows Client and Service Split

## 用户目标与范围

- 将当前产品拆分为独立的 Windows 客户端与本地服务：客户端只通过
  `http://127.0.0.1:18765` 调用服务 API，不再内嵌、启动或配置后端。
- 客户端仓库只保留 Vue/Tauri Windows 代码及其发布自动化；服务端源码、
  容器编排、镜像和服务凭据不得重新加入客户端仓库或推送到客户端 GitHub 仓库。
- 当前不交付 Web、macOS 或移动端，也不提供客户端离线任务副本、远端同步或
  服务器地址配置。
- 服务未启动或连接失败时，桌面端必须直观显示原因和“重新连接”操作，且不得
  回退读取旧本地任务数据。

## 基线与责任

- 基线 SHA：`39223023a99d287f5b9a2b33341bf8d3401ea3d7`（`v2.3.3`）。
- 功能分支：`codex/client-service-split`。
- 实现者：`/root/client_direct_service_implementer`。
- 审核者：`/root/service_repo_implementer/client_service_boundary_audit`
  与 `/root/client_clean_repo_reviewer`（均未参与客户端实现）。
- 集成人：`/root`。
- 实现 SHA：`441ceff31eb841123af0864a0f4dfe02d187e8a6`（`refactor: split Windows client from local service`）。
- 审核对象 SHA：`2e1b6114cee5c3b9f1c1ff4fcd57ee9c656e27e6`。两次独立
  只读审核均未产生代码提交；结论为客户端边界与 Windows 构建通过，服务
  数据迁移/导入卷防护仍由独立服务任务门禁控制。

## 实现结论

- 移除了内嵌后端生命周期、服务端目录和 Docker/Compose 资料、Web/macOS 发布
  路径、服务地址设置、远端同步与客户端任务离线缓存。
- API 基址固定为本机服务 `http://127.0.0.1:18765`；登录态会在服务返回
  `401/403` 时清除，临时网络故障则保留会话以便用户恢复服务后重试。
- 主界面在服务不可达时显示连接状态条和原始可读错误，并提供“重新连接”按钮，
  该按钮只调用 `taskStore.fetchTasks()`。
- 报告仍可下载，但客户端不再尝试把服务容器内的报告路径当作 Windows 文件路径
  打开。
- Tauri 开发 URL、Vite 绑定地址和 HMR WebSocket CSP 均使用
  `127.0.0.1:1420`，避免 Windows 在 `localhost`/IPv6 优先时无法加载开发界面。
- Tauri 登录态只信任 Windows Credential Manager。旧 WebView `localStorage` token
  无论凭据读取或写入成功与否都会被清除；写入凭据失败时登录不会进入内存已认证状态。
- 服务写入失败时，Markdown 弹窗和象限内新增任务都会保留用户输入、显示可重试
  错误，不会把失败操作伪装成已保存。

## 验证

- `npm test -- --run`：10 个测试文件、25 项通过；包含
  `AppLayout.test.ts`（服务不可达与重新连接）、`secureStorage.test.ts`
  （Credential Manager 与遗留 token 边界）、`ContentModal.test.ts`
  （返回错误/抛异常时保留 Markdown 草稿）、`QuadrantCard.test.ts`
  （保存失败时保留新增标题）和 `tauriConfig.test.ts`（Vite/Tauri IPv4 开发地址）。
- `npm run build`：通过（`vue-tsc --noEmit` 与 Vite production build）。
- `cargo fmt --check`：通过。
- `git diff --check`：通过。
- 客户端边界静态扫描（内嵌后端、`SERVER_URL`、同步 store、服务配置）：无命中。
- `npx tauri build --bundles nsis`：已在本机 MSVC Windows 环境通过；当前
  clean-history 候选的实际安装包为 `Focus Task_2.3.3_x64-setup.exe`，
  SHA-256 `D9F18F8D2D38112E06FFAE6FB9B23F7EB790F28FA5628F00274E88405654BF7E`。

## 审核、风险与发布门禁

- 独立代码审核：已通过客户端边界、Git 历史、Windows-only 发布路径和实际
  NSIS 构建检查；实现者未自行合入、打 tag 或推送。
- **P0 - 旧本地数据不迁移**：按本次边界，客户端不会读取、备份、迁移或删除旧
  安装目录中的任务、附件和报告。新服务使用其自己的持久数据卷，因此旧任务不会
  自动出现。必须由独立迁移任务完成并复核，或由集成人记录书面发布例外，才能
  为本次拆分打 tag 或发布。
- 服务镜像启动、bootstrap 登录、附件/任务持久化及客户端到容器的联调，由独立
  服务仓库任务记录和集成人验收；当前导入卷 bootstrap 防护 P0 尚在独立修复，
  在该证据完成前不得声称端到端交付完成。
- 本任务未推送、未合入、未打 tag、未发布。

## 修订记录（待独立复核）

- 修订实现 SHA：`5c7fee9`（`refactor: harden Windows client service boundary`）。
- 修订内容：根据独立审核修复开发地址漂移、保存失败的草稿丢失风险、Credential
  Manager 失败时残留 WebView token 的风险，并恢复服务状态条回归测试。
- 复核要求：独立审核者应复跑全量前端测试、production build、`cargo fmt --check`
  与 `git diff --check`，并确认客户端仓库未重新引入服务端源码、编排、镜像或凭据。
