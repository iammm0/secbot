use std::io::{Error, ErrorKind};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, RunEvent};

const API_INFO: &str = "http://127.0.0.1:8000/api/system/info";

/// Backend child process started by desktop (if backend is not already healthy).
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
    p.join("package.json").is_file()
        && (p.join("server").join("src").join("main.ts").is_file()
            || p.join("server").join("dist").join("main.js").is_file())
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

fn spawn_custom_backend_cmd(root: &Path, raw_cmd: &str) -> std::io::Result<Child> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", raw_cmd]);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(["-lc", raw_cmd]);
        c
    };

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

    cmd.spawn()
}

fn spawn_node_backend(root: &Path) -> std::io::Result<Child> {
    if let Ok(custom) = std::env::var("SECBOT_BACKEND_CMD") {
        let raw = custom.trim();
        if !raw.is_empty() {
            if let Ok(child) = spawn_custom_backend_cmd(root, raw) {
                return Ok(child);
            }
        }
    }

    let dist_server = root.join("server").join("dist").join("main.js");

    let mut candidates: Vec<(&str, Vec<&str>)> = Vec::new();
    if dist_server.is_file() {
        candidates.push(("node", vec!["server/dist/main.js"]));
    }

    if cfg!(target_os = "windows") {
        candidates.push(("npm.cmd", vec!["run", "start"]));
        candidates.push(("npm.cmd", vec!["run", "dev"]));
    } else {
        candidates.push(("npm", vec!["run", "start"]));
        candidates.push(("npm", vec!["run", "dev"]));
    }

    for (exe, args) in candidates {
        let mut cmd = Command::new(exe);
        cmd.args(args);
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
        "Unable to start backend. Tried node and npm commands.",
    ))
}

fn ensure_backend_background(child_slot: Arc<Mutex<Option<Child>>>) {
    std::thread::spawn(move || {
        if backend_healthy() {
            log::info!("Backend already healthy at 127.0.0.1:8000, skipping spawn");
            return;
        }

        let Some(root) = resolve_project_root() else {
            log::error!(
                "Cannot locate Secbot project root (need package.json + server entrypoint). Set SECBOT_PROJECT_ROOT if needed."
            );
            return;
        };

        log::info!("Starting Node backend from {:?}", root);
        let child = match spawn_node_backend(&root) {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to start backend: {}", e);
                return;
            }
        };

        let pid = child.id();
        if let Ok(mut g) = child_slot.lock() {
            *g = Some(child);
        }

        for i in 0..120 {
            if backend_healthy() {
                log::info!("Backend is healthy (pid {})", pid);
                return;
            }
            std::thread::sleep(Duration::from_millis(500));
            if i == 59 {
                log::warn!("Backend is still starting...");
            }
        }

        log::error!("Backend did not become healthy in time (/api/system/info timeout)");
    });
}

fn kill_backend_slot(slot: &Arc<Mutex<Option<Child>>>) {
    if let Ok(mut g) = slot.lock() {
        if let Some(mut c) = g.take() {
            let _ = c.kill();
            let _ = c.wait();
            log::info!("Stopped desktop-started backend process");
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
        .setup(move |app| {
            ensure_backend_background(slot_for_thread);
            if cfg!(debug_assertions) {
                app.handle().plugin(
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
