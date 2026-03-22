use std::io::{Error, ErrorKind};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, RunEvent};

const API_INFO: &str = "http://127.0.0.1:8000/api/system/info";

/// 由本进程拉起的 Python 后端子进程（若端口上已有服务则不会写入）
pub struct BackendChild(pub Arc<Mutex<Option<Child>>>);

fn backend_healthy() -> bool {
    ureq::get(API_INFO)
        .timeout(Duration::from_secs(2))
        .call()
        .map(|r| r.status() == 200)
        .unwrap_or(false)
}

fn resolve_project_root() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("SECBOT_PROJECT_ROOT") {
        let path = PathBuf::from(p.trim());
        if is_secbot_root(&path) {
            return Some(path);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(root) = walk_up_for_root(cwd) {
            return Some(root);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Some(root) = walk_up_for_root(dir.to_path_buf()) {
                return Some(root);
            }
        }
    }
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let from_cargo = manifest_dir.parent()?.parent()?;
    if is_secbot_root(from_cargo) {
        return Some(from_cargo.to_path_buf());
    }
    None
}

fn is_secbot_root(p: &Path) -> bool {
    p.join("pyproject.toml").is_file() && p.join("router").join("main.py").is_file()
}

fn walk_up_for_root(mut dir: PathBuf) -> Option<PathBuf> {
    for _ in 0..12 {
        if is_secbot_root(&dir) {
            return Some(dir);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

fn spawn_python_backend(root: &Path) -> std::io::Result<Child> {
    if let Ok(custom) = std::env::var("SECBOT_PYTHON") {
        let exe = custom.trim();
        if !exe.is_empty() {
            let mut cmd = Command::new(exe);
            cmd.args(["-m", "router.main"]);
            cmd.current_dir(root);
            cmd.env("SECBOT_DESKTOP", "1");
            cmd.stdin(Stdio::null());
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            if let Ok(c) = cmd.spawn() {
                return Ok(c);
            }
        }
    }

    let candidates: &[(&str, &[&str])] = if cfg!(target_os = "windows") {
        &[
            ("python", &["-m", "router.main"]),
            ("py", &["-3", "-m", "router.main"]),
        ]
    } else {
        &[
            ("python3", &["-m", "router.main"]),
            ("python", &["-m", "router.main"]),
        ]
    };
    for (exe, args) in candidates {
        let mut cmd = Command::new(exe);
        cmd.args(*args);
        cmd.current_dir(root);
        cmd.env("SECBOT_DESKTOP", "1");
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        match cmd.spawn() {
            Ok(c) => return Ok(c),
            Err(e) if e.kind() == ErrorKind::NotFound => continue,
            Err(e) => return Err(e),
        }
    }
    Err(Error::new(
        ErrorKind::NotFound,
        "未找到 Python 解释器（已尝试 python / py -3 / python3）",
    ))
}

fn ensure_backend_background(child_slot: Arc<Mutex<Option<Child>>>) {
    std::thread::spawn(move || {
        if backend_healthy() {
            log::info!("后端已在 127.0.0.1:8000 运行，跳过拉起");
            return;
        }
        let Some(root) = resolve_project_root() else {
            log::error!(
                "无法定位 Secbot 项目根（需包含 pyproject.toml 与 router/main.py）。可设置环境变量 SECBOT_PROJECT_ROOT。"
            );
            return;
        };
        log::info!("正在从 {:?} 拉起 Python 后端…", root);
        let child = match spawn_python_backend(&root) {
            Ok(c) => c,
            Err(e) => {
                log::error!("拉起后端失败: {}", e);
                return;
            }
        };
        let pid = child.id();
        if let Ok(mut g) = child_slot.lock() {
            *g = Some(child);
        }
        for i in 0..120 {
            if backend_healthy() {
                log::info!("后端已就绪 (pid {})", pid);
                return;
            }
            std::thread::sleep(Duration::from_millis(500));
            if i == 59 {
                log::warn!("后端仍在启动中，请稍候…");
            }
        }
        log::error!("后端在超时时间内未响应 /api/system/info");
    });
}

fn kill_backend_slot(slot: &Arc<Mutex<Option<Child>>>) {
    if let Ok(mut g) = slot.lock() {
        if let Some(mut c) = g.take() {
            let _ = c.kill();
            let _ = c.wait();
            log::info!("已结束后台 Python 进程");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child_slot: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let slot_for_thread = child_slot.clone();
    let slot_for_exit = child_slot.clone();

    let app = tauri::Builder::default()
        .manage(BackendChild(child_slot))
        .setup(move |_app| {
            ensure_backend_background(slot_for_thread);
            if cfg!(debug_assertions) {
                _app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |_app_handle: &AppHandle, event: RunEvent| {
        if let RunEvent::Exit = event {
            kill_backend_slot(&slot_for_exit);
        }
    });
}
