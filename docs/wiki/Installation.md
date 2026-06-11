# 安装指南

## 环境要求

- **Node.js** `>= 24`
- **npm** `>= 10`
- 真实终端 TTY（Ink TUI 需要；Windows 推荐 Windows Terminal / PowerShell）
- 可选：**Ollama**（本地模型）

## 方式一：GitHub Release（推荐）

1. 打开 [Releases](https://github.com/iammm0/secbot/releases)，下载最新 `.tgz`（当前 **v2.0.0-b2** → `opensec-secbot-2.0.0-b2.tgz`）

2. 全局安装：

```bash
npm install -g ./opensec-secbot-2.0.0-b2.tgz
secbot
```

3. 或一次性运行：

```bash
npx ./opensec-secbot-2.0.0-b2.tgz
```

4. 仅 API 后端：

```bash
secbot-server
```

5. MCP 模式：

```bash
secbot-mcp
```

敏感工具默认对 MCP 隐藏；需显式设置 `SECBOT_MCP_ALLOW_SENSITIVE=true`。

## 方式二：从源码构建

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
git checkout release
npm ci
npm run start:stack
```

## 不支持的安装方式

- ❌ `npm install -g @opensec/secbot` — **未发布到 npmjs**
- ❌ 仓库内已无官方 Docker / 移动端一键部署链路

## 安装后配置

在工作目录创建 `.env`，参见 [[Environment-Variables|环境变量]] 与 [[Quick-Start|快速开始]]。

TUI 内 `/model` 可配置 provider、API Key、模型；配置持久化到 SQLite / `config.yaml`。

## 验证安装

```bash
secbot-server &
curl http://127.0.0.1:8000/health
```

默认端口 `8000`，可用 `PORT` 覆盖。
