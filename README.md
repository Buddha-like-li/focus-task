> 开始开发前，请阅读 [协作规则](AGENTS.md) 和 [功能总账](docs/feature-ledger.md)。

# Focus Task Windows Client

Focus Task 是面向 Windows 11 的四象限任务桌面客户端。它由 Vue 3 界面和 Tauri Windows 壳组成，直接调用本机 Focus Task 服务的 API。

## 当前边界

- 客户端固定连接 `http://127.0.0.1:18765`。
- 任务、附件、报告、团队和账户数据均以服务端 API 为唯一来源；客户端不再保存离线任务副本或执行远端同步。
- 登录会话仅保存在 Windows Credential Manager；客户端不会保存服务端账号密码。
- 本仓库不含服务端源码、服务端部署文件或服务端运行时。
- 客户端不会读取、迁移、备份或删除旧版本安装目录中的数据。旧数据兼容是独立的 P0 任务，未解决前不能将旧任务视为会自动显示。
- 当前只构建 Windows NSIS 安装包；Web、macOS 和移动端不在本阶段范围内。

本仓库是独立的 Windows 客户端候选仓库。它没有继承旧项目 Git 历史、服务端源码、服务镜像、容器编排、数据库或凭证；`origin` 已配置但尚未推送。详细边界、审核与发布门禁见 [协作规则](AGENTS.md)、[功能总账](docs/feature-ledger.md) 和 [任务记录](docs/task-records/)。

## 已提供能力

- 四象限任务、今日/已完成/汇总视图
- 任务详情、子任务、附件、Markdown 内容和报告下载
- 需求池、团队协作、评论和任务转交
- Windows 系统通知、日志落盘和应用内更新检查
- 服务不可达时的明确错误提示；恢复服务后重新加载即可继续操作

## 本地开发与验证

```powershell
Set-Location frontend
npm ci
npm test -- --run
npm run build
Set-Location src-tauri
cargo fmt --check
npx tauri build --bundles nsis
```

安装包构建后位于 `frontend/src-tauri/target/release/bundle/nsis/`。发布版本号和签名流程见 [发布规范](docs/releasing.md)。
