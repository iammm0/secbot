// 发布构建下隐藏 Windows 控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

use std::sync::Mutex;
use std::time::Duration;

use backend::BackendProcess;
use tauri::{Manager, RunEvent, Url};

/// 全局持有后端子进程句柄，供退出时清理。
struct BackendState(Mutex<Option<BackendProcess>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let port = backend::backend_port();

            // 非远程模式下拉起本地 secbot-server（dev: 系统 node；prod: sidecar）
            if !backend::use_remote() {
                match backend::spawn_backend(&handle) {
                    Ok(child) => {
                        let state = app.state::<BackendState>();
                        *state.0.lock().unwrap() = Some(child);
                    }
                    Err(err) => {
                        eprintln!("[secbot-desktop] 启动后端失败: {err}");
                    }
                }
            } else {
                eprintln!("[secbot-desktop] 远程模式：跳过本地后端启动，连接 :{port}");
            }

            // 后台线程等待端口就绪，再把主窗口导航到后端托管的 web 前端
            std::thread::spawn(move || {
                if backend::wait_for_port(port, Duration::from_secs(60)) {
                    if let Some(win) = handle.get_webview_window("main") {
                        match Url::parse(&format!("http://localhost:{port}")) {
                            Ok(url) => {
                                if let Err(err) = win.navigate(url) {
                                    eprintln!("[secbot-desktop] 导航到后端失败: {err}");
                                }
                            }
                            Err(err) => eprintln!("[secbot-desktop] URL 解析失败: {err}"),
                        }
                    }
                } else {
                    eprintln!("[secbot-desktop] 后端在超时时间内未就绪，保留加载页");
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("构建 Tauri 应用失败")
        .run(|app_handle, event| {
            // 应用退出时结束后端子进程，避免残留
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                let state = app_handle.state::<BackendState>();
                let child = state.0.lock().unwrap().take();
                if let Some(child) = child {
                    child.kill();
                }
            }
        });
}
