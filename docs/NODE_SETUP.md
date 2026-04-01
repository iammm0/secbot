# Node 环境与依赖说明

Secbot 仓库里有三个需要 Node.js 的前端工程：

- `terminal-ui/`：Ink 终端界面
- `app/`：Expo / React Native 移动端
- `desktop/`：Tauri + Vite 桌面端

本文档只保留与当前仓库相关的通用说明，不再记录某台开发机上的 IDE 路径。

## 推荐版本

- **最低要求**：Node.js `18+`
- **推荐**：Node.js `20` 或 `22` LTS

原因：

- `terminal-ui/package.json` 明确要求 `node >= 18`
- Expo、Vite、Tauri 在 `20/22 LTS` 上通常更稳定

## 安装依赖

### `terminal-ui`

```bash
cd terminal-ui
npm install
```

### `app`

```bash
cd app
npm install
```

### `desktop`

```bash
cd desktop
npm install
```

## 常用启动命令

### 终端 TUI

```bash
cd terminal-ui
npm run tui
```

### 移动端

```bash
cd app
npm start
```

### 桌面端

```bash
cd desktop
npm run tauri dev
```

## IDE 配置建议

无论你使用 PyCharm、VS Code 还是其它 IDE，建议做法都是：

1. 选择一个全局可用的 Node `20/22 LTS`
2. 让三个前端工程都复用这个解释器
3. 各目录分别执行 `npm install`

## 关于依赖告警

当前仓库里若出现下列情况，通常不代表项目代码本身有问题：

- Expo / React Native 生态的传递依赖弃用告警
- `npm audit` 中来自上游依赖链的历史问题

其中 `app/package.json` 已通过 `overrides` 固定 `markdown-it` 版本，用于降低已知风险。

## 排障建议

### 1. `npm install` 失败

优先检查：

- `node -v`
- `npm -v`
- 当前是否在正确目录下执行

### 2. Tauri 启动失败

除了 Node 之外，Tauri 还依赖本机 Rust / 系统 GUI 工具链。若 `npm run tauri dev` 失败，请优先检查 Tauri 官方环境要求。

### 3. Expo 无法连接后端

这通常是后端地址问题，而不是 Node 版本问题。请同时检查：

- 后端是否启动在 `8000`
- `app/src/api/config.ts` 是否指向正确地址
