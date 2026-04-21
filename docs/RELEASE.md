# 发布指南

本仓库当前发布的是 npm 包 `@opensec/secbot`。包内包含：

- `server/dist`
- `terminal-ui/dist`
- `terminal-ui/package.json`
- `scripts/run-product.js`
- 根 README 与许可证
- `docs/SECURITY_WARNING.md`

发布配置以 `package.json`、`.github/workflows/release.yml` 和 `scripts/verify_release_package.js` 为准。

## 用户安装

```bash
npm install -g @opensec/secbot
secbot
```

仅启动后端：

```bash
secbot-server
```

一次性运行：

```bash
npx @opensec/secbot
```

也可以从 GitHub Releases 下载 `.tgz` 包。

## 本地发布前检查

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run build:terminal-ui
```

验证发布包：

```bash
npm run release:verify
```

打包：

```bash
npm run release:pack
```

或直接：

```bash
npm pack
```

## package scripts

| 脚本 | 说明 |
|------|------|
| `npm run build` | 构建 NestJS 后端 |
| `npm run build:terminal-ui` | 构建 Ink TUI |
| `npm run release:build` | 清理并构建后端 |
| `npm run release:pack` | 构建后端并执行 `npm pack` |
| `npm run release:verify` | 在临时目录安装 tarball 并验证二进制入口 |

注意：根包的 `prepack` 会执行 `npm run build && npm run build:terminal-ui`，因此直接 `npm pack` 也会构建两个产物。

## GitHub Actions 发布

工作流：

```text
.github/workflows/release.yml
```

触发方式：

- 推送 `v*.*.*` 标签。
- 手动 `workflow_dispatch`。

标签版本必须与 `package.json` 中的 `version` 完全一致。例如：

```bash
npm version 2.0.1 --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): 2.0.1"
git tag v2.0.1
git push origin main-ts-version --tags
```

CI 会执行：

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. `npm test`
6. `npm run release:pack`
7. 上传 `.tgz` 到 GitHub Release
8. 发布到 npm registry
9. 发布到 GitHub Packages

预发布版本（版本号包含 `-`）会发布到 npm 的 `next` tag。

## npm Trusted Publishing

`release.yml` 使用 npm Trusted Publishing，也就是 GitHub Actions OIDC，不需要 `NPM_TOKEN`。需要在 npm 包页面配置 trusted publisher：

- 仓库：`iammm0/secbot`
- Workflow 文件：`release.yml`
- Package：`@opensec/secbot`

如果 trusted publisher 未配置，npm 发布步骤会失败。

## GitHub Packages

GitHub Packages 发布前会运行：

```bash
node scripts/apply-github-packages-name.js
```

它会把包名改为仓库所有者 scope 下的包，例如：

```text
@iammm0/secbot
```

这与 npmjs 上的 `@opensec/secbot` 并存。

## 不可覆盖已发布版本

npm 与 GitHub Packages 都不允许覆盖同一版本。若 CI 报类似 `Cannot publish over previously published version`，需要提升 `package.json` 版本并重新打标签。

## 版本文档

- 根目录变更日志：[../CHANGELOG.md](../CHANGELOG.md)
- 历史 release notes：[releases/README.md](releases/README.md)

当前仓库没有 `scripts/release-docs.js`，不要再使用旧文档中的 release-docs 命令。
