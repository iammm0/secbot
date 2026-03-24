# Node 环境与依赖说明

**Secbot 要求 Node.js 22 及以上**（`terminal-ui/`、`desktop/`、`mobile/` 的 `package.json` 中 `engines.node` 与此一致）。

## 当前状态

- **项目依赖**：已更新，并通过 `overrides` 修复了 `markdown-it` 安全漏洞，`npm audit` 显示 0 个漏洞。
- **弃用警告**：`inflight`、`rimraf@3`、`glob@7` 等来自 React Native/Expo 的传递依赖，上游更新后会自动消失，无需在本项目中修改。

## 在 PyCharm 中切换到最新 Node（如 24 LTS）

你当前使用的 Node 来自：

`C:\Users\Mingjun Zhao\AppData\Roaming\JetBrains\PyCharm2024.3\node\versions\`

该目录下已有：`20.15.0`、`22.13.0`、`22.15.0`（当前在用）。若要使用**最新 LTS（如 Node 24.x）**，可任选其一：

### 方式一：在 PyCharm 中让 IDE 下载新版本（推荐）

1. 打开 **File → Settings**（Windows/Linux）或 **PyCharm → Preferences**（macOS）。
2. 进入 **Languages & Frameworks → Node.js**。
3. 在 **Node interpreter** 处点击下拉或 **Add…**。
4. 若列表中有 **Download Node.js** 或 **Download…**，选择 **v24.x (LTS)**，由 PyCharm 下载并安装到上述 `node\versions` 目录。
5. 选择刚下载的 24.x 作为解释器，确认保存。

### 方式二：使用本机已安装的 Node 24

1. 从 [https://nodejs.org](https://nodejs.org) 下载并安装 **Node.js 24.x (LTS)**（Windows 安装包会安装到例如 `C:\Program Files\nodejs\`）。
2. 在 PyCharm 中：**File → Settings → Languages & Frameworks → Node.js**。
3. **Node interpreter** 选 **Add…** → **Local…**，指向本机 Node 24 的 `node.exe`（例如 `C:\Program Files\nodejs\node.exe`）。
4. 确认后，PyCharm 的 npm/Node 将使用该版本。

### 切换后建议

在项目目录（即本 `app` 目录）下执行一次：

```bash
npm install
```

即可用新 Node 环境重新安装/校验依赖。

## 依赖更新记录

- 已执行 `npm audit fix`，修复了可自动修复的漏洞（如 minimatch、tar）。
- 已在 `package.json` 中加入 `overrides`，将 `markdown-it` 固定为 `>=12.3.2`，消除 `react-native-markdown-display` 带来的中危漏洞。
- 当前 `npm audit` 结果为 **0 vulnerabilities**。
