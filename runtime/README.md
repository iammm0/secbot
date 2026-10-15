# Secbot Internal Runtime (ExecGo & ExecGo Runtime)

本目录封装了 Secbot 官方内置的底层任务执行引擎与沙箱运行时系统（Monorepo 内部收敛）。

## 目录结构

```
runtime/
├── bin/                 # 本地构建生成的原生二进制文件（已加入 .gitignore，通过构建脚本生成）
│   ├── execgo           # Go 控制面与任务调度引擎 daemon
│   ├── execgocli        # ExecGo 适配器命令行工具
│   └── execgo-runtime   # Rust 数据面沙箱运行时 daemon
├── execgo/              # Go 1.22+ 任务执行引擎与控制面源码
│   ├── cmd/
│   │   ├── execgo/      # daemon 服务入口（HTTP + gRPC）
│   │   └── execgocli/   # agent/CLI 适配器入口
│   ├── pkg/             # 调度器、任务图校验、适配器
│   └── contrib/         # gRPC/插件扩展
└── execgo-runtime/      # Rust 1.74+ 数据面隔离与沙箱源码
    ├── Cargo.toml
    └── src/             # Linux namespace / cgroup 隔离、资源记账、HTTP 数据面 API
```

## 构建命令

在仓库根目录执行：

```bash
# 同时构建 Go 与 Rust 运行时组件并放入 runtime/bin/
npm run build:runtime

# 或仅构建 Go 组件（无需 Rust 工具链）
node scripts/build-runtime.mjs --only-go

# 或仅构建 Rust 沙箱组件
node scripts/build-runtime.mjs --only-rust

# 重新构建前清理
node scripts/build-runtime.mjs --clean
```

## 路径解析与优先级

后端服务通过 `server/src/modules/tools/control/execgo-paths.ts` 按以下优先级定位运行时：

1. 环境变量显式指定（`EXECGO_EXECGOCLI`, `EXECGO_SERVER_BIN`, `EXECGO_RUNTIME_BIN`, `EXECGO_BIN_DIR`）。
2. Secbot 内部运行时产物目录：`runtime/bin/`。
3. Secbot 内部源码构建产物：`runtime/execgo/` 与 `runtime/execgo-runtime/target/release/`。
4. 外部同级目录源码与构建产物（`../execgo`, `../execgo-runtime`），供独立多仓库开发调试。
5. 系统 `PATH` 回退。

## 发行打包与自包含

- **TUI 发行包** (`scripts/pack-tui-dist.mjs`):
  构建时自动检测并将 `runtime/bin/` 中的原生二进制打包进发行归档中。
- **桌面端应用** (`desktop/scripts/prepare-backend.mjs`):
  构建时自动将 `runtime/bin/` 装配进 Tauri resources (`desktop/src-tauri/backend/runtime/bin`)。
