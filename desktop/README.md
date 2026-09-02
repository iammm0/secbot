# Secbot 桌面端（Desktop）

基于 **Tauri v2** 的 Secbot 桌面客户端。它**不重复实现任何业务逻辑**，而是：

1. 作为原生外壳启动一个窗口；
2. 在本地把 `secbot-server`（NestJS 后端）作为 **sidecar 子进程**拉起；
3. 后端就绪后，窗口 `navigate` 到 `http://localhost:8000`。

由于后端通过 `@nestjs/serve-static` 同时托管了 `web/dist`（根路径）与 `/api/*`，
桌面端加载的就是**后端托管的 web 前端**——同源、零 CORS、`web/` 代码无需任何改动。

开发模式用系统 `node` 直接跑仓库内 `server/dist/main.js`；发布模式则用**随包的
Node 运行时**跑打进 `resources` 的自包含后端，安装包可独立分发（无需目标机装 Node）。

```
┌────────────────────────── Secbot.app ──────────────────────────┐
│  Tauri (Rust) 外壳                                               │
│    ├─ 启动窗口 → 先显示 splash 加载页                             │
│    ├─ spawn: node ../../server/dist/main.js  (PORT=8000)         │
│    ├─ 轮询 127.0.0.1:8000 直到就绪                                │
│    └─ window.navigate("http://localhost:8000")                  │
│                                                                 │
│  WebView                                                        │
│    └─ http://localhost:8000  → web/dist (React 19 + Vite)       │
│         └─ fetch('/api/*') 同源直达 NestJS                       │
└─────────────────────────────────────────────────────────────────┘
```

## 为什么选 Tauri v2

- 体积小（~几 MB，对比 Electron ~150MB）、内存占用低，使用系统 WebView。
- 直接复用 `web/` 的 Vite + React 19 + Tailwind，无需迁移。
- 后端作为独立 Node 进程随 App 生命周期启停，契合现有 `secbot-server` 架构。
- 安全模型好，符合安全类工具的定位。

## 目录结构

```
desktop/
├── package.json              # 通过 @tauri-apps/cli 驱动 dev/build
├── splash/
│   └── index.html            # 后端就绪前的加载页
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json        # frontendDist 指向 ../splash
    ├── capabilities/default.json
    ├── icons/                 # 由 `npm run icon` 生成（见下）
    └── src/
        ├── main.rs            # Tauri 入口 + 生命周期
        └── backend.rs         # sidecar 拉起 / 就绪探测 / 退出清理
```

## 环境准备（首次）

1. **Rust 工具链**（Tauri 必需）：
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```
   macOS 还需 Xcode Command Line Tools：`xcode-select --install`。

2. **安装桌面端依赖并生成图标**：
   ```bash
   cd desktop
   npm install
   npm run icon        # 从 ../assets/secbot-main.png 生成各平台图标
   ```

3. 确保仓库根依赖已安装（`server` 与 `web`）：
   ```bash
   cd .. && npm ci && npm --prefix web ci
   ```

## 运行

```bash
cd desktop
npm run dev          # 先构建 server + web，再 tauri dev
```

`npm run dev` 会：
1. `build:deps` → 构建 `server`（tsc）与 `web`（vite build）；
2. `tauri dev` → 启动窗口并拉起后端，就绪后自动跳转。

打包（自包含，可分发）：

```bash
npm run build        # build:deps → prepare-backend → tauri build
```

`npm run build` 会：
1. `build:deps` → 构建 `server`（tsc）与 `web`（vite build）；
2. `prepare-backend` → 把 `server/dist`+`web/dist`+**生产版 `node_modules`**（含当前平台原生
   `better-sqlite3`）装配进 `src-tauri/backend/`，并把当前 Node 运行时复制为
   `src-tauri/binaries/secbot-node-<target-triple>`（Tauri externalBin sidecar）；
3. `tauri build` → 产出各平台安装包（`.dmg` / `.msi` / `.exe` / `.deb` / `.AppImage`），
   后端资源作为 `resources` 打进包内。

> 产物体积约 300–400MB（内含完整 Node 运行时与依赖），属打包 Node 后端的正常范围。
> 发布模式下，`backend/` 与 `binaries/` 为脚本生成、已 gitignore。

### 发布模式路径解析

`src/backend.rs` 在发布构建下优先用 Tauri `resource_dir()` 定位随包后端，失败时按平台
用 `current_exe()` 回退推导（`.app/Contents/Resources`、Windows 同级目录、Linux `../lib/…`）。
sidecar `secbot-node` 通过 shell 插件按 target triple 解析。

> 注：Tauri shell 插件在解析 sidecar 时，若可执行文件路径含符号链接（如从 `/var`、`/tmp`
> 等软链目录运行）会报错。正式安装到 `/Applications` 等真实路径不受影响。

## 环境变量

| 变量 | 作用 | 默认 |
|------|------|------|
| `SECBOT_DESKTOP_PORT` | 后端端口 | `8000` |
| `SECBOT_NODE_BIN` | node 可执行文件路径 | PATH 中的 `node` |
| `SECBOT_SERVER_ENTRY` | 后端入口 `main.js` 路径（生产打包指向随包资源） | 仓库内 `../../server/dist/main.js` |
| `SECBOT_DESKTOP_REMOTE` | `1`/`true` 时不拉起本地后端，仅连接已运行实例 | 未设置 |

后端自身的 `LLM_PROVIDER`、`*_API_KEY`、`NVD_API_KEY` 等变量会被子进程继承，用法与 `secbot-server` 一致。

## CI / 自动发布

仓库根 `.github/workflows/release.yml` 提供手动触发的发布流水线：

- **测试版**（默认，`release_type=test`）：版本号自动生成 `X.Y.Z-beta.<run_number>`，
  npm 包打 `beta` dist-tag，GitHub Release 标记 pre-release。
- **正式版**（`release_type=formal`）：必须显式填入 `version`（如 `2.0.0`），
  npm 包打 `latest`，Release 为正式发布。

产线：① npm 包 `@<owner>/secbot`（含 server + TUI + web + CLI）→ GitHub Packages；
② 桌面安装包（macOS arm64/x64、Windows x64、Linux x64 矩阵）→ 附加到同一 Release。

> 桌面矩阵在每个 OS 上**原生**执行 `prepare-backend`，因此各平台的原生模块与 Node
> 运行时都与目标平台匹配。

## 代码签名与公证（可选，后续）

当前安装包未签名/未公证。分发时如需去除系统告警：

- [ ] macOS：Developer ID 签名 + notarization（配置 `APPLE_*` secrets 后接入 workflow）；
- [ ] Windows：代码签名证书。
