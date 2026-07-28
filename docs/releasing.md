# Windows 客户端发布规范

## Clean-history 候选门禁

`codex/client-clean-history` 是本地审核候选，不是已发布基线。在独立审核者确认 Git 历史、索引边界、客户端测试、Windows NSIS 构建和客户端/服务联调之前：

- 不得执行 `git push`、创建 tag、创建 GitHub Release 或触发发布工作流。
- 不得复用或重建旧项目的 tag；当前源文件中的 `2.3.3` 只是来源应用版本，不表示本仓库拥有 `v2.3.3` 发布。
- 不得把服务镜像、数据卷 archive、服务端 `.env`、数据库、私钥或测试账号加入提交或 Release 资产。

只有集成人在任务记录中登记审核结论和发布批准后，才能选择下一版本和远程推送时机。

## 版本号

使用 `MAJOR.MINOR.PATCH`：新功能递增 minor，修复递增 patch，不兼容改动递增 major。版本必须同时更新：

- `frontend/src-tauri/tauri.conf.json`
- `frontend/src-tauri/Cargo.toml`
- `frontend/package.json`

在干净工作区执行：

```bash
bash scripts/bump-version.sh patch
```

## 发布前门禁

1. 实现任务已经独立审核并在任务记录中写明复核结论。
2. `npm test -- --run`、`npm run build`、`cargo fmt --check` 和 `git diff --check` 均通过。
3. Windows 本地构建或 CI 构建能产生 NSIS 安装包。
4. `TAURI_SIGNING_PRIVATE_KEY` 已配置为 GitHub repository secret，且沿用现有 updater 公钥对应的私钥。
5. 功能总账和任务记录已更新；任何 P0 风险都已修复并复核，或具有书面发布例外。

## GitHub Release

tag `v*.*.*` 触发 `.github/workflows/release.yml` 的 Windows-only 流程：

- 签名私钥预检
- 前端测试和 Windows NSIS 构建
- 以 `Focus.Task_<version>_x64-setup.exe` 与同名 `.sig` 创建 draft Release
- 生成 Windows-only `latest.json` 后公开 Release

Tauri 本地构建产生的源文件名可能含空格；发布工作流会复制为上述带点的 canonical 资产名。`latest.json`、Release 文本和下载链接只能使用 canonical 名称。

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
