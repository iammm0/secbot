# Node 环境与依赖说明

当前仓库的 Node.js 工程只有两个：

- 根项目：NestJS 后端、npm 二进制入口、发布脚本。
- `terminal-ui/`：Ink + React 终端界面。

仓库当前没有 `app/` Expo 移动端或 `desktop/` Tauri 桌面端目录，本文档不再保留这些历史启动说明。

## 推荐版本

- 最低要求：Node.js `>= 24`
- 推荐版本：Node.js `24`
- 包管理器：npm

根包与 `terminal-ui/package.json` 都声明了 `node >= 24`。如果你使用 nvm，可以在仓库根目录执行：

```bash
nvm use
```

`.nvmrc` 中记录了当前推荐大版本。

## 安装依赖

从仓库根目录安装：

```bash
npm install
```

如果只在 `terminal-ui/` 目录内调试 TUI，也可以单独安装：

```bash
cd terminal-ui
npm install
```

多数情况下推荐先在根目录执行 `npm install`，再用根目录脚本启动。

## 常用启动命令

### 后端开发模式

```bash
npm run dev
```

### 构建并启动后端

```bash
npm run build
npm start
```

### 完整 TUI

```bash
npm run start:stack
```

### 单独启动 TUI

```bash
npm run build
npm run start:tui
```

连接已有后端：

```bash
SECBOT_TUI_BACKEND=service SECBOT_API_URL=http://127.0.0.1:8000 npm run start:tui
```

## IDE 配置建议

无论使用 PyCharm、VS Code 还是其它 IDE，建议：

1. 统一使用 Node.js `24`。
2. 在仓库根目录运行安装、构建、测试脚本。
3. 运行 TUI 时使用真实终端 TTY，避免 IDE 集成终端不支持 Ink raw mode。

## 依赖告警

如果 `npm install` 或 `npm audit` 报告来自上游依赖链的告警，先区分：

- 是否影响运行时依赖。
- 是否已经由 lockfile 固定。
- 是否需要升级根项目或 `terminal-ui/` 的直接依赖。

不要按照旧文档去处理 Expo、React Native、Tauri 或 Rust 工具链问题；这些目录当前不在仓库中。

## 排障

### `npm install` 失败

优先检查：

```bash
node -v
npm -v
pwd
```

确认 Node.js 为 `24+`，并且命令在仓库根目录执行。

### TUI 无法启动

优先检查：

- 是否先执行过 `npm run build`。
- 是否在真实终端中运行。
- `server/dist/main.js` 是否存在。
- 如果使用 service 模式，`SECBOT_API_URL` 是否指向可访问后端。

### service 模式无法连接

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/system/info
```

如果这两个请求失败，先修复后端启动问题，再启动 TUI。
