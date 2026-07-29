# Windows 客户端发布规范

## v2.3.3 验证发布

干净客户端历史已由独立审核者确认 Git 历史、索引边界、客户端测试和 Windows NSIS 构建；2026-07-28 已在用户书面授权下推送源码到 `main`。`v2.3.3` 已于 2026-07-29 公开发布，CI 已验证签名构建、NSIS、`.sig` 和 `latest.json`；随后使用客户端 updater 公钥完成独立验签。该版本仍是 Windows 本地服务验证发布，客户端/服务端端到端联调与旧数据兼容声明不因本次发布自动完成。

## 后续发布门禁

- 任何后续版本不得创建 tag、GitHub Release 或触发发布工作流，直到签名配置由独立发布任务验证并完成客户端/服务联调。
- 不得复用或重建已发布的 `v2.3.3` tag。
- 不得把服务镜像、数据卷 archive、服务端 `.env`、数据库、私钥或测试账号加入提交或 Release 资产。

只有集成人在任务记录中登记审核结论和发布批准后，才能选择下一版本和远程推送时机。源码推送不等同于 updater 发布。

## 版本号

使用 `MAJOR.MINOR.PATCH`：新功能递增 minor，修复递增 patch，不兼容改动递增 major。版本必须同时更新：

- `frontend/src-tauri/tauri.conf.json`
- `frontend/src-tauri/Cargo.toml`
- `frontend/package.json`

在干净工作区执行：

```bash
bash scripts/bump-version.sh patch
```

## 中文更新说明

每个拟发布的 tag 都必须在创建 tag 前新增对应的
`docs/release-notes/vX.Y.Z.md`。该文件是面向用户的唯一更新说明来源，
并且必须满足以下要求：

- 内容必须准确描述该版本已经完成并验收的用户可见变更，使用纯中文撰写；
  不得把英文提交信息、内部任务名、技术资产文件名、命令、路径、协议地址或占位文本直接展示给用户。
- 标题、正文和 `latest.json` 的 `notes` 都必须使用中文。技术资产文件名、
  下载地址和工作流标识只允许出现在系统元数据或下载资产列表中，不得写入版本说明源文件。
- 发布工作流会在 tag 预检阶段先调用 `scripts/validate-release-notes.sh`，使缺失或不合规说明在 Windows 签名构建前失败；写入 GitHub Release 正文和生成 updater manifest 前还会分别再次校验。该校验会拒绝空文件及含英文 ASCII 字母的说明。
- GitHub Release 标题由工作流生成为中文版本标题；GitHub Release 正文和
  `latest.json` 的 `notes` 必须直接使用同一份版本说明文件，禁止各自维护或再写英文摘要。

发布说明不是提交记录。完成实现、独立审核和集成后，由集成人根据对应任务记录写入
版本说明，再创建 tag。

## 发布前门禁

1. 实现任务已经独立审核并在任务记录中写明复核结论。
2. `npm test -- --run`、`npm run build`、`cargo fmt --check` 和 `git diff --check` 均通过。
3. Windows 本地构建或 CI 构建能产生 NSIS 安装包。
4. `TAURI_SIGNING_PRIVATE_KEY` 已配置为 GitHub repository secret，且沿用现有 updater 公钥对应的私钥。
5. 功能总账和任务记录已更新；任何 P0 风险都已修复并复核，或具有书面发布例外。

## GitHub 签名 Secret

在仓库所有者账号下打开
`https://github.com/Buddha-like-li/focus-task/settings/secrets/actions`，依次进入
`Settings -> Secrets and variables -> Actions -> Repository secrets`。必须使用
**Repository secrets**，不要使用 Environment secrets。

| Secret 名称 | 应填写的值 | 说明 |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `%USERPROFILE%\.tauri\focus-task.key` 的完整原始文本 | 填入文件内容，不是文件路径，不加引号；必须沿用现有 updater 公钥对应的私钥。 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 创建该私钥时使用的原始密码（仅私钥加密时） | 不是 Windows 登录密码、GitHub token 或私钥文件路径。私钥未设置密码时不创建此 secret；密码未知时不得猜测或新建密码。 |

私钥和密码绝不能写入 Git、任务记录、镜像、日志或 Release 附件。若原密码无法找回，
不要直接生成新 key；新 key 会破坏已安装客户端对 updater 签名的信任，必须另立迁移任务。

## GitHub Release

tag `v*.*.*` 触发 `.github/workflows/release.yml` 的 Windows-only 流程：

- 签名私钥预检
- 前端测试和 Windows NSIS 构建
- 以 `Focus.Task_<version>_x64-setup.exe` 与同名 `.sig` 创建 draft Release
- 生成 Windows-only `latest.json` 后公开 Release

Tauri 本地构建产生的源文件名可能含空格；发布工作流会复制为上述带点的 canonical 资产名。`latest.json` 的下载地址和 Release 资产列表必须使用 canonical 名称；中文版本说明源文件不得写入资产名称或下载链接。

## 提交与推送

仅集成人可完成以下操作：

```bash
git status
git commit -am "release vX.Y.Z"
git tag vX.Y.Z
git push origin <approved-client-branch>
git push origin vX.Y.Z
```

服务镜像和服务端数据发布不属于本仓库的发布流程。
