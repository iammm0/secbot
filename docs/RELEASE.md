# 发布指南

本仓库使用以下发布资源：

- 根目录变更日志：[../CHANGELOG.md](../CHANGELOG.md)
- 版本文档：[releases/README.md](releases/README.md)
- 工作流：[../.github/workflows/release.yml](../.github/workflows/release.yml)

## 用户下载

从 [GitHub Releases](https://github.com/iammm0/secbot/releases) 下载打包产物。

当前发布包命名为 `secbot-<platform>.zip`，也可通过 npm 安装：

```bash
# 全局安装
npm install -g @opensec/secbot
secbot

# 或通过 npx 直接运行
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
  --version v2.0.0 \
  --platform windows-amd64 \
  --output dist/README_RELEASE.md
```

## 说明

- 仓库根目录没有 `.env.example`，因此发布文档中会嵌入可复制的 `.env` 片段。
- `npm install -g secbot` 与 GitHub Release 打包产物提供的运行时表面可能存在差异。打包发布产物仍然是开箱即用终端体验的最佳途径。
