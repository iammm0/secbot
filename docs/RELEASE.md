# 发布指南

本仓库当前发布的是 GitHub Release `.tgz` 构建包。包内 npm 元数据仍使用 `@opensec/secbot`，但 release workflow 不再发布到 npmjs 或 GitHub Packages。包内包含：

- `server/dist`
- `terminal-ui/dist`
- `terminal-ui/package.json`
- `scripts/run-product.js`
- 根 README 与许可证
- `docs/SECURITY_WARNING.md`

发布配置以 `package.json`、`.github/workflows/release.yml` 和 `scripts/verify_release_package.js` 为准。

## 用户安装

```bash
npm install -g ./opensec-secbot-<version>.tgz
secbot
```

仅启动后端：

```bash
secbot-server
```

一次性运行本地包：

```bash
npx ./opensec-secbot-<version>.tgz
```

从 GitHub Releases 下载对应版本的 `.tgz` 包后替换 `<version>`。

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
| `npm run release:pack` | 构建后端并执行 `npm pack` 生成 `.tgz` |
| `npm run release:verify` | 在临时目录安装 tarball 并验证二进制入口 |

注意：根包的 `prepack` 会执行后端构建、TUI 构建、`web` 依赖安装和 Web 构建，因此直接 `npm pack` 也会生成完整产物。

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

预发布版本（版本号包含 `-`）会在 GitHub Release 中标记为 prerelease。

## 不发布到 npm

`release.yml` 不再包含 npmjs Trusted Publishing，也不会发布到 GitHub Packages。发布产物只作为 `.tgz` 上传到 GitHub Release。

## 不可覆盖已发布资产

同一 tag 的 GitHub Release 会被 workflow 更新并重新上传 `.tgz`。正式发布时仍建议提升 `package.json` 版本并打新标签，避免用户拿到不同内容但版本号相同的包。

## 版本文档

- 根目录变更日志：[../CHANGELOG.md](../CHANGELOG.md)
- 历史 release notes：[releases/README.md](releases/README.md)

当前仓库没有 `scripts/release-docs.js`，不要再使用旧文档中的 release-docs 命令。
