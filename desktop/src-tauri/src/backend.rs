//! secbot-server 后端进程的拉起、就绪探测与退出清理，区分两种运行模式：
//!
//! - **开发（debug 构建 / `tauri dev`）**：用系统 `node` 直接运行仓库内
//!   `../../server/dist/main.js`，依赖仓库已构建产物，便于本地迭代。
//! - **发布（release 构建 / `tauri build`）**：用随包的 Node 运行时（Tauri
//!   externalBin sidecar `secbot-node`）运行打进 resources 的
//!   `backend/server/dist/main.js`，实现自包含、可分发。
//!
//! 后端会同时托管 web 前端（`web/dist`）与 `/api/*`，窗口随后 navigate 到
//! `http://localhost:<port>`，同源、零 CORS 地复用 web。

use std::net::TcpStream;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// 后端子进程句柄：开发模式为 std 进程，发布模式为 Tauri sidecar 进程。
pub enum BackendProcess {
    Std(std::process::Child),
    Sidecar(CommandChild),
}

impl BackendProcess {
    pub fn kill(self) {
        match self {
            BackendProcess::Std(mut child) => {
                let _ = child.kill();
                let _ = child.wait();
            }
            BackendProcess::Sidecar(child) => {
                let _ = child.kill();
            }
        }
    }
}

/// 后端监听端口。可用 `SECBOT_DESKTOP_PORT` 覆盖，默认 8000（与后端一致）。
pub fn backend_port() -> u16 {
    std::env::var("SECBOT_DESKTOP_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8000)
}

/// 是否跳过拉起本地后端（连接远程 / 已运行实例）。
pub fn use_remote() -> bool {
    matches!(
        std::env::var("SECBOT_DESKTOP_REMOTE").ok().as_deref(),
        Some("1") | Some("true")
    )
}

/// 开发模式下的后端入口：相对本 crate 的 `../../server/dist/main.js`。
fn dev_server_entry() -> PathBuf {
    if let Ok(p) = std::env::var("SECBOT_SERVER_ENTRY") {
        return PathBuf::from(p);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("server")
        .join("dist")
        .join("main.js")
}

/// 健壮地解析随包后端目录（发布模式）。优先用 Tauri 的 `resource_dir()`，
/// 失败时回退到基于 `current_exe()` 的按平台推导，兼容 .app / Windows / Linux。
fn bundled_backend_dir(app: &AppHandle) -> PathBuf {
    // 策略 1：Tauri resource_dir()
    if let Ok(dir) = app.path().resource_dir() {
        let cand = dir.join("backend");
        if cand.join("server").join("dist").join("main.js").exists() {
            return cand;
        }
    }
    // 策略 2：基于可执行文件路径推导
    if let Ok(exe) = std::env::current_exe() {
        let mut candidates: Vec<PathBuf> = Vec::new();
        // macOS: <App>.app/Contents/MacOS/bin → <App>.app/Contents/Resources/backend
        #[cfg(target_os = "macos")]
        if let Some(contents) = exe.parent().and_then(|p| p.parent()) {
            candidates.push(contents.join("Resources").join("backend"));
        }
        // Windows / Linux: 资源通常与可执行文件同级，或位于 resources/ 子目录
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("backend"));
            candidates.push(dir.join("resources").join("backend"));
            // Linux (deb/rpm/AppImage) 常见布局：../lib/<app>/backend
            candidates.push(dir.join("..").join("lib").join("secbot-desktop").join("backend"));
        }
        for cand in candidates {
            if cand.join("server").join("dist").join("main.js").exists() {
                return cand;
            }
        }
    }
    // 兜底：resource_dir 原值（即使不存在也返回，便于日志定位）
    app.path()
        .resource_dir()
        .map(|d| d.join("backend"))
        .unwrap_or_else(|_| PathBuf::from("backend"))
}

/// 启动后端子进程：
/// - debug 构建：系统 `node` + 仓库路径；
/// - release 构建：sidecar `secbot-node` + resources 内 `backend/server/dist/main.js`。
pub fn spawn_backend(app: &AppHandle) -> Result<BackendProcess, String> {
    let port = backend_port();

    if cfg!(debug_assertions) {
        let entry = dev_server_entry();
        let node = std::env::var("SECBOT_NODE_BIN").unwrap_or_else(|_| "node".into());
        eprintln!(
            "[secbot-desktop][dev] 启动后端: {} {} (PORT={})",
            node,
            entry.display(),
            port
        );
        let child = std::process::Command::new(node)
            .arg(&entry)
            .env("PORT", port.to_string())
            .spawn()
            .map_err(|e| format!("启动系统 node 失败: {e}"))?;
        Ok(BackendProcess::Std(child))
    } else {
        // resources 内的后端入口：<resource>/backend/server/dist/main.js
        let backend_dir = bundled_backend_dir(app);
        let entry = backend_dir
            .join("server")
            .join("dist")
            .join("main.js");
        eprintln!(
            "[secbot-desktop][prod] 启动 sidecar 后端: secbot-node {} (PORT={})",
            entry.display(),
            port
        );
        let (_rx, child) = app
            .shell()
            .sidecar("secbot-node")
            .map_err(|e| format!("解析 sidecar secbot-node 失败: {e}"))?
            .arg(entry.to_string_lossy().to_string())
            .env("PORT", port.to_string())
            .spawn()
            .map_err(|e| format!("启动 sidecar node 失败: {e}"))?;
        Ok(BackendProcess::Sidecar(child))
    }
}

/// 轮询 TCP 端口直到可连接或超时，返回是否就绪。
pub fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}
