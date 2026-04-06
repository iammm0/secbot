# 发布指南

本仓库使用以下发布资源：

- 根目录变更日志：[../CHANGELOG.md](../CHANGELOG.md)
- 版本文档：[releases/README.md](releases/README.md)
- 工作流：[../.github/workflows/release.yml](../.github/workflows/release.yml)

## 用户下载

从 [GitHub Releases](https://github.com/iammm0/secbot/releases) 下载打包产物。

当前发布包命名为 `secbot-<platform>.zip`，也可通过 npm 安装：

```bash
# 全局安装：`secbot` 会启动后端 + 终端 TUI（一节真实 TTY 中运行；IDE 集成终端在 Windows 上可能自动新开窗口）
npm install -g @opensec/secbot
secbot

# 仅启动 HTTP API（自动化 / 自建前端）
secbot-server

# 或通过 npx 直接运行完整产品
npx @opensec/secbot
```

在首次启动前创建 `.env` 文件。最小示例：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner
```

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

## 维护者流程

发布元数据来源：

- `package.json` 中的 `version` 字段
- `CHANGELOG.md` 中的可读发布说明

GitHub Actions 工作流：

1. 判断是否需要创建发布。
2. 使用 `npm run build` 构建 TypeScript 后端。
3. 打包发布产物并上传到 GitHub Release。
4. 发布 npm 包（如配置）。
5. 同一次打标还会 **发布到 GitHub Packages**（使用 `GITHUB_TOKEN`，无需额外 Secret）：包名为 `@<仓库所有者小写>/secbot`（例如 `iammm0/secbot` 对应 `@iammm0/secbot`），与 npmjs 上的 `@opensec/secbot` **名称不同、可并存**。在仓库 **Settings → Packages**（或个人 **Packages**）中查看。

**`NPM_TOKEN` 与 2FA**：若 npm 账号启用了双因素认证，CI 里必须用 **Granular 令牌且允许发布时绕过 2FA**，或 **Classic 的 Automation 令牌**；否则会出现 `403 ... bypass 2fa enabled is required to publish`。

**不可覆盖已发布版本**：npm 与 GitHub Packages 均不允许同一版本号二次 `publish`；若 CI 报 `Cannot publish over previously published version`，须将 `package.json` 的 `version` 与标签同步抬升（如 `2.0.0` → `2.0.1`）后再打新标签发布。

### 从 GitHub Packages 安装（可选）

消费方仓库需在 `.npmrc` 中指向 `https://npm.pkg.github.com`，并使用具有 `read:packages` 权限的 **Classic PAT**（或有权读取该包的工作流 token）。包名示例：`@iammm0/secbot`。详见 [Working with the npm registry](https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)。

## 本地发布任务

安装依赖：

```bash
npm install
```

构建应用：

```bash
npm run build
```

打包发布产物：

```bash
npm pack
```

生成版本文档：

```bash
node scripts/release-docs.js version-docs --changelog CHANGELOG.md --output-dir docs/releases
```

生成打包产物的发布说明：

```bash
node scripts/release-docs.js package-readme \
  --changelog CHANGELOG.md \
  --version v2.0.2 \
  --platform windows-amd64 \
  --output dist/README_RELEASE.md
```

## 说明

- 仓库根目录没有 `.env.example`，因此发布文档中会嵌入可复制的 `.env` 片段。
- `npm install -g secbot` 与 GitHub Release 打包产物提供的运行时表面可能存在差异。打包发布产物仍然是开箱即用终端体验的最佳途径。
