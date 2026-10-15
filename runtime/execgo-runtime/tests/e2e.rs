//! execgo-runtime 端到端测试：进程启动、HTTP API、CLI 流程 / execgo-runtime end-to-end tests: process bootstrap, HTTP API, and CLI flows.
// Author: iammm0; Last edited: 2026-04-23

use std::{
    net::TcpListener,
    path::Path,
    process::{Child, Command, Stdio},
    time::Duration,
};

use reqwest::Client;
use serde_json::{json, Value};
use tempfile::TempDir;
use tokio::time::{sleep, timeout};

/// find_free_port 申请一个临时可用端口供测试 runtime 使用 / acquires a temporary free port for the test runtime.
fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("bind free port")
        .local_addr()
        .expect("local addr")
        .port()
}

/// TestServer 封装测试期启动的 runtime 子进程及其临时目录 / wraps the runtime subprocess and temp directory started during tests.
struct TestServer {
    base_url: String,
    child: Child,
    _temp: TempDir,
}

impl TestServer {
    /// start 使用默认参数启动测试 runtime / starts the test runtime with default arguments.
    async fn start() -> Self {
        Self::start_with_args(&[]).await
    }

    /// start_with_args 使用额外 CLI 参数启动测试 runtime / starts the test runtime with extra CLI arguments.
    async fn start_with_args(extra_args: &[&str]) -> Self {
        let temp = TempDir::new().expect("tempdir");
        let port = find_free_port();
        let base_url = format!("http://127.0.0.1:{port}");
        let mut child = Command::new(env!("CARGO_BIN_EXE_execgo-runtime"));
        child
            .arg("serve")
            .arg("--listen-addr")
            .arg(format!("127.0.0.1:{port}"))
            .arg("--data-dir")
            .arg(temp.path())
            .arg("--termination-grace-ms")
            .arg("200")
            .arg("--dispatch-poll-interval-ms")
            .arg("100")
            .arg("--gc-interval-ms")
            .arg("10000");
        for arg in extra_args {
            child.arg(arg);
        }
        child.stdout(Stdio::null()).stderr(Stdio::null());

        let child = child.spawn().expect("spawn server");
        let server = Self {
            base_url,
            child,
            _temp: temp,
        };
        server.wait_ready().await;
        server
    }

    /// wait_ready 轮询 readyz，直到测试 runtime 可用 / polls readyz until the test runtime becomes available.
    async fn wait_ready(&self) {
        let client = Client::new();
        for _ in 0..100 {
            if let Ok(response) = client.get(format!("{}/readyz", self.base_url)).send().await {
                if response.status().is_success() {
                    return;
                }
            }
            sleep(Duration::from_millis(50)).await;
        }
        panic!("server did not become ready");
    }
}

impl Drop for TestServer {
    /// drop 在测试结束时清理 runtime 子进程 / cleans up the runtime subprocess when the test ends.
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// command_output_with_timeout runs a CLI command with a hard test timeout so regressions fail fast.
async fn command_output_with_timeout(
    mut command: Command,
    timeout_duration: Duration,
    label: &str,
) -> std::process::Output {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().expect(label);
    let started = std::time::Instant::now();
    loop {
        if child.try_wait().expect(label).is_some() {
            return child.wait_with_output().expect(label);
        }
        if started.elapsed() >= timeout_duration {
            let _ = child.kill();
            let _ = child.wait();
            panic!("{label} timed out after {timeout_duration:?}");
        }
        sleep(Duration::from_millis(50)).await;
    }
}

/// submit_task 通过 HTTP 提交任务并断言请求成功 / submits a task over HTTP and asserts a successful request.
async fn submit_task(server: &TestServer, payload: Value) -> Value {
    Client::new()
        .post(format!("{}/api/v1/tasks", server.base_url))
        .json(&payload)
        .send()
        .await
        .expect("submit request")
        .error_for_status()
        .expect("submit success")
        .json::<Value>()
        .await
        .expect("submit json")
}

/// submit_task_raw 提交任务但保留原始 HTTP 响应，便于断言错误路径 / submits a task while preserving the raw HTTP response for error-path assertions.
async fn submit_task_raw(server: &TestServer, payload: Value) -> reqwest::Response {
    Client::new()
        .post(format!("{}/api/v1/tasks", server.base_url))
        .json(&payload)
        .send()
        .await
        .expect("submit request")
}

/// get_json 拉取任意 JSON 接口并断言成功 / fetches any JSON endpoint and asserts success.
async fn get_json(server: &TestServer, path: &str) -> Value {
    Client::new()
        .get(format!("{}{}", server.base_url, path))
        .send()
        .await
        .expect("get request")
        .error_for_status()
        .expect("get success")
        .json::<Value>()
        .await
        .expect("get json")
}

/// get_status 拉取单个任务状态 / fetches the status of a single task.
async fn get_status(server: &TestServer, task_id: &str) -> Value {
    Client::new()
        .get(format!("{}/api/v1/tasks/{task_id}", server.base_url))
        .send()
        .await
        .expect("status request")
        .error_for_status()
        .expect("status success")
        .json::<Value>()
        .await
        .expect("status json")
}

/// wait_terminal 轮询任务直到进入终态 / polls a task until it reaches a terminal state.
async fn wait_terminal(server: &TestServer, task_id: &str) -> Value {
    for _ in 0..120 {
        let status = get_status(server, task_id).await;
        if matches!(
            status.get("status").and_then(Value::as_str),
            Some("success" | "failed" | "cancelled")
        ) {
            return status;
        }
        sleep(Duration::from_millis(100)).await;
    }
    panic!("task did not reach terminal state");
}

/// command_task_runs_to_success_and_persists_artifacts 验证命令任务可成功执行，并能保留产物与事件流 / verifies that a command task succeeds and persists artifacts and events.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn command_task_runs_to_success_and_persists_artifacts() {
    let server = TestServer::start().await;
    let submitted = submit_task(
        &server,
        json!({
            "execution": {
                "kind": "command",
                "program": "/bin/sh",
                "args": ["-c", "echo hello-runtime; echo problem >&2"]
            }
        }),
    )
    .await;
    let task_id = submitted["task_id"].as_str().expect("task id");

    let terminal = wait_terminal(&server, task_id).await;
    assert_eq!(terminal["status"], "success");
    assert!(terminal["stdout"]
        .as_str()
        .unwrap_or_default()
        .contains("hello-runtime"));
    assert!(terminal["stderr"]
        .as_str()
        .unwrap_or_default()
        .contains("problem"));

    let result_path = terminal["artifacts"]["result_path"]
        .as_str()
        .expect("result path");
    assert!(Path::new(result_path).exists());

    let events = Client::new()
        .get(format!("{}/api/v1/tasks/{task_id}/events", server.base_url))
        .send()
        .await
        .expect("events request")
        .error_for_status()
        .expect("events success")
        .json::<Value>()
        .await
        .expect("events json");
    let event_types: Vec<_> = events
        .as_array()
        .expect("events array")
        .iter()
        .filter_map(|event| event.get("event_type").and_then(Value::as_str))
        .collect();
    assert!(event_types.contains(&"submitted"));
    assert!(event_types.contains(&"accepted"));
    assert!(event_types.contains(&"started"));
    assert!(event_types.contains(&"finished"));
}

/// cli_run_and_kill_flow_work 验证 submit、kill、run 等 CLI 子命令可串起完整流程 / verifies that submit, kill, and run CLI commands form a complete end-to-end flow.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cli_run_and_kill_flow_work() {
    let server = TestServer::start().await;
    let payload = json!({
        "execution": {
            "kind": "command",
            "program": "/bin/sh",
            "args": ["-c", "sleep 5"]
        }
    });

    let mut submit_command = Command::new(env!("CARGO_BIN_EXE_execgo-runtime"));
    submit_command
        .arg("submit")
        .arg("--server")
        .arg(&server.base_url)
        .arg("--json")
        .arg(payload.to_string());
    let submit_output =
        command_output_with_timeout(submit_command, Duration::from_secs(5), "cli submit").await;
    assert!(submit_output.status.success());
    let submitted: Value =
        serde_json::from_slice(&submit_output.stdout).expect("submit stdout json");
    let task_id = submitted["task_id"].as_str().expect("task id");

    for _ in 0..40 {
        let status = get_status(&server, task_id).await;
        if status["status"] == "running" {
            break;
        }
        sleep(Duration::from_millis(100)).await;
    }

    let mut kill_command = Command::new(env!("CARGO_BIN_EXE_execgo-runtime"));
    kill_command
        .arg("kill")
        .arg("--server")
        .arg(&server.base_url)
        .arg(task_id);
    let kill_output =
        command_output_with_timeout(kill_command, Duration::from_secs(5), "cli kill").await;
    assert!(kill_output.status.success());

    let terminal = wait_terminal(&server, task_id).await;
    assert_eq!(terminal["status"], "cancelled");

    let mut run_command = Command::new(env!("CARGO_BIN_EXE_execgo-runtime"));
    run_command
        .arg("run")
        .arg("--server")
        .arg(&server.base_url)
        .arg("--json")
        .arg(
            json!({
                "execution": {
                    "kind": "command",
                    "program": "/bin/sh",
                    "args": ["-c", "echo cli-run"]
                }
            })
            .to_string(),
        );
    let run_output =
        command_output_with_timeout(run_command, Duration::from_secs(5), "cli run").await;
    assert!(run_output.status.success());
    let run_status: Value = serde_json::from_slice(&run_output.stdout).expect("run stdout json");
    assert_eq!(run_status["status"], "success");
    assert!(run_status["stdout"]
        .as_str()
        .unwrap_or_default()
        .contains("cli-run"));
}

/// runtime_endpoints_and_resource_snapshot_work 验证 runtime 信息接口与资源账本快照可正常工作 / verifies that runtime info endpoints and resource-ledger snapshots work correctly.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn runtime_endpoints_and_resource_snapshot_work() {
    let server = TestServer::start_with_args(&[
        "--runtime-id",
        "runtime-test",
        "--capacity-memory-bytes",
        "134217728",
        "--capacity-pids",
        "64",
        "--disable-linux-sandbox",
        "--disable-cgroup",
    ])
    .await;

    let info = get_json(&server, "/api/v1/runtime/info").await;
    assert_eq!(info["runtime_id"], "runtime-test");
    assert_eq!(info["snapshot_version"], "v1");

    let capabilities = get_json(&server, "/api/v1/runtime/capabilities").await;
    assert_eq!(capabilities["runtime_id"], "runtime-test");
    assert_eq!(
        capabilities["resources"]["capacity"]["memory_bytes"],
        134_217_728u64
    );
    assert_eq!(capabilities["overrides"]["linux_sandbox"], "disabled");

    let config = get_json(&server, "/api/v1/runtime/config").await;
    assert_eq!(config["runtime_id"], "runtime-test");
    assert_eq!(config["default_capability_mode"], "adaptive");
    assert_eq!(config["cgroup_enabled"], false);

    let submitted = submit_task(
        &server,
        json!({
            "execution": {
                "kind": "command",
                "program": "/bin/sh",
                "args": ["-c", "sleep 2"]
            },
            "limits": {
                "wall_time_ms": 5000
            }
        }),
    )
    .await;
    let task_id = submitted["task_id"].as_str().expect("task id");

    let mut resources = get_json(&server, "/api/v1/runtime/resources").await;
    for _ in 0..40 {
        let active = resources["active_reservations"]
            .as_array()
            .expect("active reservations array");
        if active
            .iter()
            .any(|item| item["task_id"].as_str() == Some(task_id))
        {
            break;
        }
        sleep(Duration::from_millis(100)).await;
        resources = get_json(&server, "/api/v1/runtime/resources").await;
    }

    let active = resources["active_reservations"]
        .as_array()
        .expect("active reservations array");
    assert!(active
        .iter()
        .any(|item| item["task_id"].as_str() == Some(task_id)));
    assert_eq!(resources["reserved"]["task_slots"], 1);
    assert_eq!(resources["accepted_waiting_tasks"], 0);

    let terminal = wait_terminal(&server, task_id).await;
    assert_eq!(terminal["status"], "success");
}

/// adaptive_plan_is_visible_and_strict_mode_rejects 验证 adaptive 会降级、strict 会拒绝不支持能力 / verifies that adaptive mode degrades while strict mode rejects unsupported capabilities.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn adaptive_plan_is_visible_and_strict_mode_rejects() {
    let server = TestServer::start_with_args(&["--disable-linux-sandbox"]).await;

    let adaptive = submit_task(
        &server,
        json!({
            "execution": {
                "kind": "command",
                "program": "/bin/sh",
                "args": ["-c", "echo adaptive-plan"]
            },
            "sandbox": {
                "profile": "linux_sandbox"
            }
        }),
    )
    .await;
    let task_id = adaptive["task_id"].as_str().expect("task id");
    let terminal = wait_terminal(&server, task_id).await;
    assert_eq!(terminal["status"], "success");
    assert_eq!(terminal["execution_plan"]["degraded"], true);
    assert_eq!(
        terminal["execution_plan"]["effective_sandbox"]["profile"],
        "process"
    );

    let strict = submit_task_raw(
        &server,
        json!({
            "execution": {
                "kind": "command",
                "program": "/bin/sh",
                "args": ["-c", "echo strict-plan"]
            },
            "sandbox": {
                "profile": "linux_sandbox"
            },
            "policy": {
                "capability_mode": "strict"
            }
        }),
    )
    .await;
    assert_eq!(strict.status(), reqwest::StatusCode::BAD_REQUEST);
    let strict_body = strict.json::<Value>().await.expect("strict error json");
    assert_eq!(strict_body["error"]["code"], "unsupported_capability");
}

/// tenant_quota_exceeded_returns_400 验证超出租户配额的提交请求以 400 被拒绝 / verifies that a submit exceeding a tenant quota is rejected with 400.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn tenant_quota_exceeded_returns_400() {
    // alice is given a soft quota of exactly 0 task_slots so any submission is rejected
    let server = TestServer::start_with_args(&[
        "--tenant-quota",
        "alice=slots:0",
        "--disable-linux-sandbox",
        "--disable-cgroup",
    ])
    .await;

    let resp = submit_task_raw(
        &server,
        json!({
            "execution": {
                "kind": "command",
                "program": "/bin/sh",
                "args": ["-c", "echo quota-test"]
            },
            "control_context": {
                "tenant": "alice"
            }
        }),
    )
    .await;

    assert_eq!(resp.status(), reqwest::StatusCode::BAD_REQUEST);
    let body = resp.json::<Value>().await.expect("error json");
    assert_eq!(body["error"]["code"], "insufficient_resources");
}

/// owner_gated_kill_returns_403_for_wrong_owner 验证错误 owner 发起的 kill 请求以 403 被拒绝 / verifies that a kill with a wrong owner is rejected with 403.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owner_gated_kill_returns_403_for_wrong_owner() {
    let server =
        TestServer::start_with_args(&["--disable-linux-sandbox", "--disable-cgroup"]).await;

    // submit a long-running task owned by "alice"
    let submitted = submit_task(
        &server,
        json!({
            "execution": {
                "kind": "command",
                "program": "/bin/sh",
                "args": ["-c", "sleep 60"]
            },
            "control_context": {
                "owner": "alice"
            }
        }),
    )
    .await;
    let task_id = submitted["task_id"].as_str().expect("task id");

    // wait until the task is at least accepted
    for _ in 0..40 {
        let s = get_status(&server, task_id).await;
        if matches!(s["status"].as_str(), Some("accepted" | "running")) {
            break;
        }
        sleep(Duration::from_millis(100)).await;
    }

    // kill with wrong owner => 403
    let resp = timeout(
        Duration::from_secs(3),
        Client::new()
            .post(format!("{}/api/v1/tasks/{task_id}/kill", server.base_url))
            .header("x-execgo-owner", "bob")
            .send(),
    )
    .await
    .expect("wrong-owner kill request timed out")
    .expect("kill request");
    assert_eq!(resp.status(), reqwest::StatusCode::FORBIDDEN);

    // kill with correct owner => 200
    let resp_ok = timeout(
        Duration::from_secs(3),
        Client::new()
            .post(format!("{}/api/v1/tasks/{task_id}/kill", server.base_url))
            .header("x-execgo-owner", "alice")
            .send(),
    )
    .await
    .expect("right-owner kill request timed out")
    .expect("kill request ok");
    assert_eq!(resp_ok.status(), reqwest::StatusCode::OK);
}

/// cli_kill_supports_owner 验证 CLI kill 可通过 --owner 或 EXECGO_RUNTIME_OWNER 取消 owner-gated 任务 / verifies CLI kill can cancel owner-gated tasks via --owner or EXECGO_RUNTIME_OWNER.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cli_kill_supports_owner() {
    let server =
        TestServer::start_with_args(&["--disable-linux-sandbox", "--disable-cgroup"]).await;

    let wrong_owner_task = submit_task(
        &server,
        json!({
            "execution": {
                "kind": "command",
                "program": "/bin/sh",
                "args": ["-c", "sleep 60"]
            },
            "control_context": {
                "owner": "alice"
            }
        }),
    )
    .await;
    let wrong_owner_task_id = wrong_owner_task["task_id"].as_str().expect("task id");

    let mut wrong_owner_command = Command::new(env!("CARGO_BIN_EXE_execgo-runtime"));
    wrong_owner_command
        .arg("kill")
        .arg("--server")
        .arg(&server.base_url)
        .arg("--owner")
        .arg("bob")
        .arg(wrong_owner_task_id);
    let wrong_owner_output = command_output_with_timeout(
        wrong_owner_command,
        Duration::from_secs(5),
        "cli wrong-owner kill",
    )
    .await;
    assert!(!wrong_owner_output.status.success());
    let wrong_owner_status = get_status(&server, wrong_owner_task_id).await;
    assert_ne!(wrong_owner_status["status"], "cancelled");

    let mut correct_owner_command = Command::new(env!("CARGO_BIN_EXE_execgo-runtime"));
    correct_owner_command
        .arg("kill")
        .arg("--server")
        .arg(&server.base_url)
        .arg("--owner")
        .arg("alice")
        .arg(wrong_owner_task_id);
    let correct_owner_output = command_output_with_timeout(
        correct_owner_command,
        Duration::from_secs(5),
        "cli owner kill",
    )
    .await;
    assert!(correct_owner_output.status.success());
    let terminal = wait_terminal(&server, wrong_owner_task_id).await;
    assert_eq!(terminal["status"], "cancelled");

    let env_owner_task = submit_task(
        &server,
        json!({
            "execution": {
                "kind": "command",
                "program": "/bin/sh",
                "args": ["-c", "sleep 60"]
            },
            "control_context": {
                "owner": "carol"
            }
        }),
    )
    .await;
    let env_owner_task_id = env_owner_task["task_id"].as_str().expect("task id");
    let mut env_owner_command = Command::new(env!("CARGO_BIN_EXE_execgo-runtime"));
    env_owner_command
        .arg("kill")
        .arg("--server")
        .arg(&server.base_url)
        .arg(env_owner_task_id)
        .env("EXECGO_RUNTIME_OWNER", "carol");
    let env_owner_output = command_output_with_timeout(
        env_owner_command,
        Duration::from_secs(5),
        "cli env owner kill",
    )
    .await;
    assert!(env_owner_output.status.success());
    let terminal = wait_terminal(&server, env_owner_task_id).await;
    assert_eq!(terminal["status"], "cancelled");
}
