//! runtime 主流程：服务启动、任务提交/轮询、内部 shim 调度与资源控制 / runtime core: server start, task submit/poll, internal shim dispatch, and resource enforcement.
// Author: iammm0; Last edited: 2026-04-23

use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::unix::{fs::OpenOptionsExt, process::CommandExt},
    path::{Path, PathBuf},
    process::{Command as StdCommand, Stdio},
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{http::StatusCode, response::IntoResponse};
use chrono::Utc;
use nix::sys::{
    resource::{rlim_t, setrlimit, Resource},
    signal::{kill, killpg, Signal},
};
use nix::unistd::{setpgid, Pid};
use reqwest::Client;
use tokio::{sync::Notify, task::JoinHandle, time::sleep};
use tracing::{info, warn};

#[cfg(target_os = "linux")]
use nix::unistd::{chdir, chroot};

use crate::{
    capabilities::{probe_runtime_capabilities, CapabilityProbeInput},
    cli::{
        Cli, Command, InternalShimArgs, KillArgs, RemoteTaskArgs, ServeArgs, StatusArgs, WaitArgs,
    },
    error::{AppError, AppResult},
    ledger::ResourceLedger,
    metrics::render_prometheus,
    policy::resolve_execution_plan,
    repo::{generate_task_id, CompletionUpdate, Repository, TaskRecord},
    server::build_router,
    types::{
        resolve_workspace_dir, ActiveTaskReservation, CapabilityMode, ErrorCode, EventRecord,
        ExecutionKind, ExecutionPlan, ResourceCapacity, ResourceEnforcementPlan, ResourceUsage,
        RuntimeCapabilities, RuntimeConfigResponse, RuntimeErrorInfo, RuntimeInfoResponse,
        RuntimeResourcesResponse, SubmitTaskRequest, SubmitTaskResponse, TaskArtifacts,
        TaskResourceReservation, TaskStatus, TaskStatusResponse, TenantResourceView,
    },
};

/// Settings 汇总 runtime server、存储和资源控制的静态配置 / aggregates static configuration for the runtime server, storage, and resource controls.
#[derive(Debug, Clone)]
pub struct Settings {
    pub runtime_id: String,
    pub listen_addr: String,
    pub data_dir: PathBuf,
    pub tasks_dir: PathBuf,
    pub database_path: PathBuf,
    pub max_running_tasks: usize,
    pub max_queued_tasks: usize,
    pub termination_grace: Duration,
    pub result_retention: Duration,
    pub gc_interval: Duration,
    pub dispatch_poll_interval: Duration,
    pub cgroup_root: PathBuf,
    pub default_capability_mode: CapabilityMode,
    pub disable_linux_sandbox: bool,
    pub disable_cgroup: bool,
    pub capacity_memory_bytes: Option<u64>,
    pub capacity_pids: Option<u64>,
    pub tenant_quotas: BTreeMap<String, ResourceCapacity>,
}

impl Settings {
    /// from_args 从 CLI 参数构造完整 runtime 配置 / builds the full runtime configuration from CLI arguments.
    pub fn from_args(args: &ServeArgs) -> AppResult<Self> {
        let data_dir = args.data_dir.clone();
        let tasks_dir = data_dir.join("tasks");
        let database_path = data_dir.join("runtime.db");

        let mut tenant_quotas: BTreeMap<String, ResourceCapacity> = BTreeMap::new();
        for spec in &args.tenant_quota {
            let (name, capacity) = parse_tenant_quota(spec)?;
            tenant_quotas.insert(name, capacity);
        }

        Ok(Self {
            runtime_id: args
                .runtime_id
                .clone()
                .unwrap_or_else(|| default_runtime_id(&args.listen_addr)),
            listen_addr: args.listen_addr.clone(),
            data_dir,
            tasks_dir,
            database_path,
            max_running_tasks: args.max_running_tasks,
            max_queued_tasks: args.max_queued_tasks,
            termination_grace: Duration::from_millis(args.termination_grace_ms),
            result_retention: Duration::from_secs(args.result_retention_secs),
            gc_interval: Duration::from_millis(args.gc_interval_ms),
            dispatch_poll_interval: Duration::from_millis(args.dispatch_poll_interval_ms),
            cgroup_root: args.cgroup_root.clone(),
            default_capability_mode: args.default_capability_mode,
            disable_linux_sandbox: args.disable_linux_sandbox,
            disable_cgroup: args.disable_cgroup,
            capacity_memory_bytes: args.capacity_memory_bytes,
            capacity_pids: args.capacity_pids,
            tenant_quotas,
        })
    }
}

/// RuntimeService 组合 HTTP API、仓储、能力快照和资源账本 / combines the HTTP API, repository, capability snapshot, and resource ledger.
#[derive(Clone)]
pub struct RuntimeService {
    settings: Arc<Settings>,
    repo: Repository,
    capabilities: Arc<RuntimeCapabilities>,
    ledger: Arc<ResourceLedger>,
    started_at: chrono::DateTime<Utc>,
    dispatcher_notify: Arc<Notify>,
}

impl RuntimeService {
    /// new 初始化运行目录、数据库、能力探测和资源账本 / initializes runtime directories, database, capability probing, and the resource ledger.
    pub async fn new(settings: Settings) -> AppResult<Self> {
        let started_at = Utc::now();
        fs::create_dir_all(&settings.data_dir)?;
        fs::create_dir_all(&settings.tasks_dir)?;
        let repo = Repository::new(settings.database_path.clone())?;
        repo.init()?;
        let capabilities = probe_runtime_capabilities(&CapabilityProbeInput {
            runtime_id: settings.runtime_id.clone(),
            data_dir: settings.data_dir.clone(),
            cgroup_root: settings.cgroup_root.clone(),
            max_running_tasks: settings.max_running_tasks,
            disable_linux_sandbox: settings.disable_linux_sandbox,
            disable_cgroup: settings.disable_cgroup,
            capacity_memory_bytes: settings.capacity_memory_bytes,
            capacity_pids: settings.capacity_pids,
        });
        let ledger = ResourceLedger::with_tenant_quotas(
            capabilities.resources.capacity.clone(),
            settings.tenant_quotas.clone(),
        );
        Ok(Self {
            settings: Arc::new(settings),
            repo,
            capabilities: Arc::new(capabilities),
            ledger: Arc::new(ledger),
            started_at,
            dispatcher_notify: Arc::new(Notify::new()),
        })
    }

    pub fn settings(&self) -> Arc<Settings> {
        self.settings.clone()
    }

    pub fn repo(&self) -> &Repository {
        &self.repo
    }

    async fn blocking_repo<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&Repository) -> AppResult<T> + Send + 'static,
        T: Send + 'static,
    {
        let repo = self.repo.clone();
        tokio::task::spawn_blocking(move || f(&repo))
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking join: {e}")))?
    }

    pub fn capabilities(&self) -> Arc<RuntimeCapabilities> {
        self.capabilities.clone()
    }

    /// submit_task 校验请求、解析执行计划并持久化为 accepted 任务 / validates a request, resolves the execution plan, and persists it as an accepted task.
    pub async fn submit_task(&self, request: SubmitTaskRequest) -> AppResult<SubmitTaskResponse> {
        request.validate()?;
        let execution_plan = resolve_execution_plan(
            &request,
            &self.capabilities,
            self.settings.default_capability_mode,
        )?;
        let requested_reservation = TaskResourceReservation::from_limits(&request.limits);
        self.ledger.ensure_within_capacity(&requested_reservation)?;
        self.ledger.ensure_within_tenant_quota(
            request
                .control_context
                .as_ref()
                .and_then(|c| c.tenant.as_deref()),
            &requested_reservation,
        )?;

        let max_queued = self.settings.max_queued_tasks as u64;
        let count = self
            .blocking_repo(move |repo| repo.count_accepted())
            .await?;
        if count >= max_queued {
            return Err(AppError::QueueFull);
        }

        let task_id = request.task_id.clone().unwrap_or_else(generate_task_id);
        let control_context = request.control_context.clone();
        let task_dir = self.settings.tasks_dir.join(&task_id);
        let workspace_dir = resolve_workspace_dir(&task_dir, &request.sandbox)?;
        let request_path = task_dir.join("request.json");
        let result_path = task_dir.join("result.json");
        let stdout_path = task_dir.join("stdout.log");
        let stderr_path = task_dir.join("stderr.log");
        let script_path = if matches!(request.execution.kind, ExecutionKind::Script) {
            Some(
                task_dir.join(infer_script_name(
                    request
                        .execution
                        .interpreter
                        .as_ref()
                        .and_then(|items| items.first())
                        .map(String::as_str),
                )),
            )
        } else {
            None
        };

        fs::create_dir_all(&workspace_dir)?;
        fs::create_dir_all(&task_dir)?;
        write_json_file(&request_path, &request)?;
        touch_file(&stdout_path)?;
        touch_file(&stderr_path)?;

        let new_task = crate::repo::NewTaskRecord {
            task_id: task_id.clone(),
            request,
            task_dir,
            workspace_dir,
            request_path,
            result_path,
            stdout_path,
            stderr_path,
            script_path,
            execution_plan,
            control_context,
        };
        self.blocking_repo(move |repo| repo.insert_task(&new_task))
            .await?;
        self.dispatcher_notify.notify_one();

        Ok(SubmitTaskResponse {
            handle_id: task_id.clone(),
            task_id,
            status: TaskStatus::Accepted,
        })
    }

    pub async fn get_task_status(&self, task_id: &str) -> AppResult<TaskStatusResponse> {
        let id = task_id.to_string();
        let task = self.blocking_repo(move |repo| repo.get_task(&id)).await?;
        build_status_response(&task)
    }

    pub async fn get_events(&self, task_id: &str) -> AppResult<Vec<EventRecord>> {
        let id = task_id.to_string();
        self.blocking_repo(move |repo| repo.list_events(&id)).await
    }

    /// kill_task 取消任务，并在需要时向已有进程发送终止信号；可选 caller_owner 用于所有权校验 / cancels a task and sends termination signals when a process already exists; optional caller_owner enforces ownership.
    pub async fn kill_task(
        &self,
        task_id: &str,
        caller_owner: Option<String>,
    ) -> AppResult<TaskStatusResponse> {
        let id = task_id.to_string();
        let task = self
            .blocking_repo({
                let id = id.clone();
                move |repo| repo.get_task(&id)
            })
            .await?;

        // 所有权校验：若任务携带 owner，调用者必须匹配 / owner check: if the task has an owner, the caller must match
        if let Some(task_owner) = task
            .control_context
            .as_ref()
            .and_then(|c| c.owner.as_deref())
        {
            match caller_owner.as_deref() {
                Some(caller) if caller == task_owner => {}
                _ => {
                    return Err(AppError::PermissionDenied(format!(
                        "kill requires owner '{task_owner}'"
                    )));
                }
            }
        }

        if task.status.is_terminal() {
            return build_status_response(&task);
        }

        let updated = self
            .blocking_repo({
                let id = id.clone();
                move |repo| repo.set_cancel_requested(&id)
            })
            .await?;
        if updated.status == TaskStatus::Accepted {
            self.blocking_repo({
                let id = id.clone();
                move |repo| {
                    repo.cancel_accepted_task(
                        &id,
                        RuntimeErrorInfo {
                            code: ErrorCode::Cancelled,
                            message: "task cancelled before execution".into(),
                            details: None,
                        },
                    )
                }
            })
            .await?;
        } else {
            signal_task_termination(&updated, Signal::SIGTERM)?;
            self.spawn_escalation(id.clone(), updated.pgid);
        }
        self.dispatcher_notify.notify_one();
        self.get_task_status(task_id).await
    }

    pub async fn ready(&self) -> AppResult<()> {
        self.blocking_repo(|repo| repo.init()).await
    }

    /// metrics 渲染 Prometheus 指标输出 / renders Prometheus metrics output.
    pub async fn metrics(&self) -> impl IntoResponse {
        match self.blocking_repo(|repo| repo.metrics_snapshot()).await {
            Ok(snapshot) => (
                StatusCode::OK,
                [("content-type", "text/plain; version=0.0.4")],
                render_prometheus(&snapshot),
            )
                .into_response(),
            Err(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                [("content-type", "text/plain")],
                format!("metrics_error {err}\n"),
            )
                .into_response(),
        }
    }

    pub async fn runtime_info(&self) -> RuntimeInfoResponse {
        RuntimeInfoResponse {
            runtime_id: self.settings.runtime_id.clone(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            started_at: self.started_at,
            snapshot_version: self.capabilities.snapshot_version.clone(),
            platform: self.capabilities.platform.clone(),
        }
    }

    pub async fn runtime_capabilities(&self) -> RuntimeCapabilities {
        (*self.capabilities).clone()
    }

    pub async fn runtime_config(&self) -> RuntimeConfigResponse {
        RuntimeConfigResponse {
            runtime_id: self.settings.runtime_id.clone(),
            listen_addr: self.settings.listen_addr.clone(),
            data_dir: self.settings.data_dir.to_string_lossy().to_string(),
            max_running_tasks: self.settings.max_running_tasks,
            max_queued_tasks: self.settings.max_queued_tasks,
            termination_grace_ms: self.settings.termination_grace.as_millis() as u64,
            result_retention_secs: self.settings.result_retention.as_secs(),
            gc_interval_ms: self.settings.gc_interval.as_millis() as u64,
            dispatch_poll_interval_ms: self.settings.dispatch_poll_interval.as_millis() as u64,
            cgroup_root: self.settings.cgroup_root.to_string_lossy().to_string(),
            default_capability_mode: self.settings.default_capability_mode,
            cgroup_enabled: !self.settings.disable_cgroup,
        }
    }

    pub async fn runtime_resources(&self) -> AppResult<RuntimeResourcesResponse> {
        let active_tasks = self
            .blocking_repo(|repo| repo.list_active_reservations())
            .await?;
        let reservations: Vec<TaskResourceReservation> = active_tasks
            .iter()
            .filter_map(|task| task.reservation.clone())
            .collect();
        let reserved = self.ledger.reserved_capacity(reservations.iter());
        let available = self.ledger.available_capacity(&reserved);
        let active_reservations = active_tasks
            .iter()
            .filter_map(|task| {
                task.reservation
                    .as_ref()
                    .map(|reservation| ActiveTaskReservation {
                        task_id: task.task_id.clone(),
                        status: task.status.clone(),
                        reservation: reservation.clone(),
                        reserved_at: task.reserved_at,
                    })
            })
            .collect();

        // 按租户聚合已预留量 / aggregate reserved amounts per tenant
        let mut per_tenant: BTreeMap<String, ResourceCapacity> = BTreeMap::new();
        for task in &active_tasks {
            if let (Some(reservation), Some(tenant)) = (
                task.reservation.as_ref(),
                task.control_context
                    .as_ref()
                    .and_then(|c| c.tenant.as_deref()),
            ) {
                let entry = per_tenant
                    .entry(tenant.to_string())
                    .or_insert(ResourceCapacity {
                        task_slots: 0,
                        memory_bytes: None,
                        pids: None,
                    });
                add_reservation(entry, reservation);
            }
        }

        // 确保所有已配置配额的租户都出现在响应中（即使使用量为零）/ ensure every configured-quota tenant appears even with zero usage
        let quotas = self.ledger.tenant_quotas_snapshot();
        for tenant in quotas.keys() {
            per_tenant
                .entry(tenant.clone())
                .or_insert(ResourceCapacity {
                    task_slots: 0,
                    memory_bytes: None,
                    pids: None,
                });
        }

        let tenants: Vec<TenantResourceView> = per_tenant
            .into_iter()
            .map(|(tenant, tenant_reserved)| {
                let quota = quotas.get(&tenant).cloned();
                let available_opt = quota
                    .as_ref()
                    .map(|q| ResourceLedger::tenant_available_capacity(q, &tenant_reserved));
                TenantResourceView {
                    tenant,
                    quota,
                    reserved: tenant_reserved,
                    available: available_opt,
                }
            })
            .collect();

        Ok(RuntimeResourcesResponse {
            runtime_id: self.settings.runtime_id.clone(),
            capacity: self.ledger.capacity().clone(),
            reserved,
            available,
            active_reservations,
            accepted_waiting_tasks: self
                .blocking_repo(|repo| repo.count_accepted_waiting())
                .await?,
            tenants,
        })
    }

    /// start_background_loops 启动调度循环和 GC 循环 / starts the dispatcher loop and the GC loop.
    pub fn start_background_loops(&self) {
        let dispatcher_service = self.clone();
        tokio::spawn(async move {
            dispatcher_service.dispatcher_loop().await;
        });

        let gc_service = self.clone();
        tokio::spawn(async move {
            gc_service.gc_loop().await;
        });
    }

    /// recover 在服务启动时恢复未终态任务与资源预留 / recovers non-terminal tasks and reservations during service startup.
    pub async fn recover(&self) -> AppResult<()> {
        let repo = self.repo.clone();
        tokio::task::spawn_blocking(move || {
            for task in repo.list_non_terminal()? {
                match task.status {
                    TaskStatus::Accepted => {
                        if task.has_active_reservation() {
                            repo.release_resources(
                                &task.task_id,
                                "orphan accepted-task reservation released during recovery",
                            )?;
                        }
                    }
                    TaskStatus::Running => {
                        if let Some(shim_pid) = task.shim_pid {
                            if process_exists(shim_pid as i32) {
                                if !task.has_active_reservation() {
                                    let reservation =
                                        TaskResourceReservation::from_limits(&task.limits);
                                    repo.reserve_resources(
                                        &task.task_id,
                                        &reservation,
                                        "resource reservation reconstructed during recovery",
                                    )?;
                                }
                                repo.mark_recovered(&task.task_id)?;
                            } else {
                                repo.mark_recovery_lost(&task.task_id)?;
                                persist_latest_result(&repo, &task.task_id)?;
                            }
                        } else {
                            repo.mark_recovery_lost(&task.task_id)?;
                            persist_latest_result(&repo, &task.task_id)?;
                        }
                    }
                    TaskStatus::Success | TaskStatus::Failed | TaskStatus::Cancelled => {}
                }
            }
            Ok::<(), AppError>(())
        })
        .await
        .map_err(|e| AppError::Internal(format!("spawn_blocking join: {e}")))??;
        self.dispatcher_notify.notify_one();
        Ok(())
    }

    /// dispatcher_loop 持续尝试从 accepted 队列分发任务 / continuously attempts to dispatch tasks from the accepted queue.
    async fn dispatcher_loop(&self) {
        loop {
            if let Err(err) = self.dispatch_once().await {
                warn!(error = %err, "dispatcher iteration failed");
            }
            tokio::select! {
                _ = self.dispatcher_notify.notified() => {},
                _ = sleep(self.settings.dispatch_poll_interval) => {},
            }
        }
    }

    /// dispatch_once 执行一次调度周期，预留资源并启动内部 shim / executes one dispatch cycle by reserving resources and starting the internal shim.
    async fn dispatch_once(&self) -> AppResult<()> {
        let svc = self.clone();
        tokio::task::spawn_blocking(move || svc.dispatch_once_sync())
            .await
            .map_err(|e| AppError::Internal(format!("spawn_blocking join: {e}")))?
    }

    fn dispatch_once_sync(&self) -> AppResult<()> {
        let active_reservations = self.repo.list_active_reservations()?;
        let mut current_reserved = self.ledger.reserved_capacity(
            active_reservations
                .iter()
                .filter_map(|task| task.reservation.as_ref()),
        );

        // 按租户聚合当前预留量 / aggregate currently reserved capacity per tenant
        let mut tenant_reserved: BTreeMap<String, ResourceCapacity> = BTreeMap::new();
        for task in &active_reservations {
            if let (Some(reservation), Some(tenant)) = (
                task.reservation.as_ref(),
                task.control_context
                    .as_ref()
                    .and_then(|c| c.tenant.as_deref()),
            ) {
                let entry = tenant_reserved
                    .entry(tenant.to_string())
                    .or_insert(ResourceCapacity {
                        task_slots: 0,
                        memory_bytes: self
                            .ledger
                            .tenant_quota(tenant)
                            .and_then(|q| q.memory_bytes)
                            .map(|_| 0u64),
                        pids: self
                            .ledger
                            .tenant_quota(tenant)
                            .and_then(|q| q.pids)
                            .map(|_| 0u64),
                    });
                add_reservation(entry, reservation);
            }
        }

        let tasks = self.repo.list_accepted(self.settings.max_queued_tasks)?;
        for task in tasks {
            if task.kill_requested {
                self.repo.cancel_accepted_task(
                    &task.task_id,
                    RuntimeErrorInfo {
                        code: ErrorCode::Cancelled,
                        message: "task cancelled before execution".into(),
                        details: None,
                    },
                )?;
                persist_latest_result(&self.repo, &task.task_id)?;
                continue;
            }

            if task.has_active_reservation() {
                continue;
            }

            let reservation = task
                .reservation
                .clone()
                .unwrap_or_else(|| TaskResourceReservation::from_limits(&task.limits));
            if !self.ledger.can_reserve(&current_reserved, &reservation) {
                continue;
            }

            // 租户配额检查 / per-tenant quota check
            let tenant = task
                .control_context
                .as_ref()
                .and_then(|c| c.tenant.as_deref());
            let empty_tenant_cap = ResourceCapacity {
                task_slots: 0,
                memory_bytes: self
                    .ledger
                    .tenant_quota(tenant.unwrap_or(""))
                    .and_then(|q| q.memory_bytes)
                    .map(|_| 0u64),
                pids: self
                    .ledger
                    .tenant_quota(tenant.unwrap_or(""))
                    .and_then(|q| q.pids)
                    .map(|_| 0u64),
            };
            let tr = tenant
                .and_then(|t| tenant_reserved.get(t))
                .unwrap_or(&empty_tenant_cap);
            if !self.ledger.can_reserve_for_tenant(tenant, tr, &reservation) {
                continue;
            }

            self.repo
                .reserve_resources(&task.task_id, &reservation, "task resources reserved")?;
            add_reservation(&mut current_reserved, &reservation);

            // 更新租户预留量 / update tenant reserved map
            if let Some(t) = tenant {
                let entry = tenant_reserved
                    .entry(t.to_string())
                    .or_insert(ResourceCapacity {
                        task_slots: 0,
                        memory_bytes: self
                            .ledger
                            .tenant_quota(t)
                            .and_then(|q| q.memory_bytes)
                            .map(|_| 0u64),
                        pids: self
                            .ledger
                            .tenant_quota(t)
                            .and_then(|q| q.pids)
                            .map(|_| 0u64),
                    });
                add_reservation(entry, &reservation);
            }

            let exe = std::env::current_exe()
                .map_err(|err| AppError::LaunchFailed(format!("resolve current exe: {err}")))?;
            let mut child = StdCommand::new(exe);
            child
                .arg("internal-shim")
                .arg("--database")
                .arg(self.settings.database_path.as_os_str())
                .arg("--data-dir")
                .arg(self.settings.data_dir.as_os_str())
                .arg("--task-id")
                .arg(&task.task_id)
                .arg("--termination-grace-ms")
                .arg(self.settings.termination_grace.as_millis().to_string())
                .arg("--cgroup-root")
                .arg(self.settings.cgroup_root.as_os_str())
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());

            match child.spawn() {
                Ok(handle) => {
                    self.repo.mark_dispatched(&task.task_id, handle.id())?;
                    info!(task_id = %task.task_id, shim_pid = handle.id(), "task dispatched");
                }
                Err(err) => {
                    let update = CompletionUpdate {
                        status: TaskStatus::Failed,
                        finished_at: Utc::now(),
                        duration_ms: Some(0),
                        exit_code: None,
                        exit_signal: None,
                        error: Some(RuntimeErrorInfo {
                            code: ErrorCode::LaunchFailed,
                            message: format!("failed to spawn shim: {err}"),
                            details: None,
                        }),
                        usage: None,
                        result_json: None,
                    };
                    self.repo.complete_task(&task.task_id, &update)?;
                    subtract_reservation(&mut current_reserved, &reservation);
                    persist_latest_result(&self.repo, &task.task_id)?;
                }
            }
        }
        Ok(())
    }

    /// gc_loop 定期回收超过保留期的任务目录和数据库记录 / periodically garbage-collects task directories and database rows past retention.
    async fn gc_loop(&self) {
        loop {
            sleep(self.settings.gc_interval).await;
            let svc = self.clone();
            let _ = tokio::task::spawn_blocking(move || {
                let cutoff = match chrono::Duration::from_std(svc.settings.result_retention) {
                    Ok(duration) => Utc::now() - duration,
                    Err(_) => Utc::now(),
                };
                match svc.repo.list_gc_candidates(cutoff) {
                    Ok(tasks) => {
                        for task in tasks {
                            if let Err(err) = fs::remove_dir_all(&task.task_dir) {
                                if err.kind() != std::io::ErrorKind::NotFound {
                                    warn!(task_id = %task.task_id, error = %err, "failed to remove task directory during gc");
                                    continue;
                                }
                            }
                            if let Err(err) = svc.repo.delete_task(&task.task_id) {
                                warn!(task_id = %task.task_id, error = %err, "failed to delete task row during gc");
                            }
                        }
                    }
                    Err(err) => warn!(error = %err, "gc iteration failed"),
                }
            })
            .await;
        }
    }

    /// spawn_escalation 在宽限期后升级为 SIGKILL / escalates termination to SIGKILL after the grace period.
    fn spawn_escalation(&self, task_id: String, pgid: Option<i32>) {
        let repo = self.repo.clone();
        let grace = self.settings.termination_grace;
        tokio::spawn(async move {
            sleep(grace).await;
            let _ = tokio::task::spawn_blocking(move || {
                if let Ok(task) = repo.get_task(&task_id) {
                    if task.status == TaskStatus::Running {
                        if let Some(pgid) = pgid.or(task.pgid) {
                            let _ = killpg(Pid::from_raw(pgid), Signal::SIGKILL);
                        } else if let Some(pid) = task.pid {
                            let _ = kill(Pid::from_raw(pid as i32), Signal::SIGKILL);
                        }
                    }
                }
            })
            .await;
        });
    }
}

/// run 是 runtime CLI 的统一入口 / is the unified entrypoint for the runtime CLI.
pub async fn run(cli: Cli) -> AppResult<()> {
    init_tracing();
    match cli.command {
        Command::Serve(args) => run_server(args).await,
        Command::Submit(args) => submit_remote(args).await,
        Command::Status(args) => status_remote(args).await,
        Command::Kill(args) => kill_remote(args).await,
        Command::Wait(args) => wait_remote(args).await,
        Command::Run(args) => run_remote(args).await,
        Command::InternalShim(args) => run_internal_shim(args).await,
    }
}

/// run_server 启动 HTTP server 并挂载后台循环 / starts the HTTP server and attaches background loops.
async fn run_server(args: ServeArgs) -> AppResult<()> {
    let service = RuntimeService::new(Settings::from_args(&args)?).await?;
    service.recover().await?;
    service.start_background_loops();

    let listener = tokio::net::TcpListener::bind(&service.settings.listen_addr)
        .await
        .map_err(|err| AppError::Internal(format!("bind failed: {err}")))?;
    info!(listen_addr = %service.settings.listen_addr, "execgo-runtime listening");
    axum::serve(listener, build_router(service))
        .await
        .map_err(|err| AppError::Internal(format!("server error: {err}")))
}

/// submit_remote 调用远程 runtime 的 submit API / calls the remote runtime submit API.
async fn submit_remote(args: RemoteTaskArgs) -> AppResult<()> {
    let client = http_client();
    let request = load_request(&args)?;
    let response = client
        .post(format!("{}/api/v1/tasks", trim_server(&args.server)))
        .json(&request)
        .send()
        .await?;
    print_json_response(response).await
}

/// status_remote 调用远程 runtime 的 status API / calls the remote runtime status API.
async fn status_remote(args: StatusArgs) -> AppResult<()> {
    let client = http_client();
    let response = client
        .get(format!(
            "{}/api/v1/tasks/{}",
            trim_server(&args.server),
            args.task_id
        ))
        .send()
        .await?;
    print_json_response(response).await
}

/// kill_remote 调用远程 runtime 的 kill API / calls the remote runtime kill API.
async fn kill_remote(args: KillArgs) -> AppResult<()> {
    let client = http_client();
    let mut request = client.post(format!(
        "{}/api/v1/tasks/{}/kill",
        trim_server(&args.server),
        args.task_id
    ));
    if let Some(owner) = args
        .owner
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        request = request.header("x-execgo-owner", owner);
    }
    let response = request.send().await?;
    print_json_response(response).await
}

/// wait_remote 轮询远程任务直到终态或超时 / polls a remote task until it reaches a terminal state or times out.
async fn wait_remote(args: WaitArgs) -> AppResult<()> {
    let client = http_client();
    let start = Instant::now();
    loop {
        let response = client
            .get(format!(
                "{}/api/v1/tasks/{}",
                trim_server(&args.server),
                args.task_id
            ))
            .send()
            .await?;

        if !response.status().is_success() {
            return print_json_response(response).await;
        }

        let payload: TaskStatusResponse = response.json().await?;
        if payload.status.is_terminal() {
            println!("{}", serde_json::to_string_pretty(&payload)?);
            return Ok(());
        }
        if let Some(timeout) = args.timeout() {
            if start.elapsed() >= timeout {
                return Err(AppError::Internal("wait timeout exceeded".into()));
            }
        }
        sleep(Duration::from_millis(args.poll_interval_ms)).await;
    }
}

/// run_remote 远程提交后立即等待任务结束 / submits remotely and immediately waits for task completion.
async fn run_remote(args: RemoteTaskArgs) -> AppResult<()> {
    let request = load_request(&args)?;
    let client = http_client();
    let response = client
        .post(format!("{}/api/v1/tasks", trim_server(&args.server)))
        .json(&request)
        .send()
        .await?;
    if !response.status().is_success() {
        return print_json_response(response).await;
    }
    let payload: SubmitTaskResponse = response.json().await?;
    wait_remote(WaitArgs {
        server: args.server,
        task_id: payload.task_id,
        timeout_ms: args.timeout_ms,
        poll_interval_ms: args.poll_interval_ms,
    })
    .await
}

/// run_internal_shim 在子进程中拉起真实工作负载并等待完成 / launches the actual workload in a subprocess and waits for completion inside the shim.
async fn run_internal_shim(args: InternalShimArgs) -> AppResult<()> {
    let repo = Repository::new(args.database.clone())?;
    repo.init()?;
    let mut task = repo.get_task(&args.task_id)?;
    if task.status.is_terminal() {
        return Ok(());
    }
    if task.kill_requested && task.pid.is_none() {
        repo.complete_task(
            &task.task_id,
            &CompletionUpdate {
                status: TaskStatus::Cancelled,
                finished_at: Utc::now(),
                duration_ms: Some(0),
                exit_code: None,
                exit_signal: None,
                error: Some(RuntimeErrorInfo {
                    code: ErrorCode::Cancelled,
                    message: "task cancelled before process launch".into(),
                    details: None,
                }),
                usage: None,
                result_json: None,
            },
        )?;
        persist_latest_result(&repo, &task.task_id)?;
        return Ok(());
    }

    let execution_plan = task
        .execution_plan
        .clone()
        .unwrap_or_else(|| legacy_execution_plan(&task));

    match spawn_task_process(&task, &execution_plan, &args.cgroup_root) {
        Ok(spawned) => {
            repo.mark_started(
                &task.task_id,
                spawned.pid,
                spawned.pgid,
                spawned.script_path.as_deref(),
            )?;
            task = repo.get_task(&task.task_id)?;
            let wait_handle = tokio::task::spawn_blocking(move || wait_for_pid(spawned.pid as i32));
            let outcome = supervise_wait(
                &repo,
                &task,
                wait_handle,
                args.termination_grace_ms,
                execution_plan.resource_enforcement.wall_time_ms,
                spawned.pgid,
                spawned.cgroup_dir.as_deref(),
            )
            .await?;
            repo.complete_task(&task.task_id, &outcome.completion)?;
            persist_latest_result(&repo, &task.task_id)?;
        }
        Err(err) => {
            repo.complete_task(
                &task.task_id,
                &CompletionUpdate {
                    status: TaskStatus::Failed,
                    finished_at: Utc::now(),
                    duration_ms: Some(0),
                    exit_code: None,
                    exit_signal: None,
                    error: Some(match err {
                        AppError::SandboxSetup(message) => RuntimeErrorInfo {
                            code: ErrorCode::SandboxSetupFailed,
                            message,
                            details: None,
                        },
                        AppError::LaunchFailed(message) => RuntimeErrorInfo {
                            code: ErrorCode::LaunchFailed,
                            message,
                            details: None,
                        },
                        other => RuntimeErrorInfo {
                            code: ErrorCode::Internal,
                            message: other.to_string(),
                            details: None,
                        },
                    }),
                    usage: None,
                    result_json: None,
                },
            )?;
            persist_latest_result(&repo, &task.task_id)?;
        }
    }
    Ok(())
}

/// SpawnedProcess 保存已启动 workload 进程的关键信息 / stores key information about a launched workload process.
#[derive(Debug)]
struct SpawnedProcess {
    pid: u32,
    pgid: i32,
    script_path: Option<PathBuf>,
    cgroup_dir: Option<PathBuf>,
}

/// WaitOutcome 包装等待进程结束后的归类结果 / wraps the classified completion result after waiting for process exit.
#[derive(Debug)]
struct WaitOutcome {
    completion: CompletionUpdate,
}

/// spawn_task_process 根据任务和执行计划启动真实工作负载 / launches the actual workload from a task record and execution plan.
fn spawn_task_process(
    task: &TaskRecord,
    execution_plan: &ExecutionPlan,
    _cgroup_root: &Path,
) -> AppResult<SpawnedProcess> {
    let stdout_file = open_output_file(&task.stdout_path)?;
    let stderr_file = open_output_file(&task.stderr_path)?;
    let (mut command, script_path) = build_command(task, stdout_file, stderr_file)?;

    let resource_enforcement = execution_plan.resource_enforcement.clone();
    let sandbox = execution_plan.effective_sandbox.clone();
    let _rootfs = sandbox.rootfs.clone();
    unsafe {
        command.pre_exec(move || {
            setpgid(Pid::from_raw(0), Pid::from_raw(0)).map_err(nix_to_io)?;
            apply_resource_enforcement(&resource_enforcement).map_err(nix_to_io)?;
            #[cfg(target_os = "linux")]
            apply_linux_sandbox(&sandbox, _rootfs.as_deref()).map_err(nix_to_io)?;
            Ok(())
        });
    }

    let child = command
        .spawn()
        .map_err(|err| AppError::LaunchFailed(format!("spawn process: {err}")))?;
    let pid = child.id();
    let pgid = pid as i32;
    drop(child);

    let cgroup_dir = if execution_plan.resource_enforcement.cgroup_enforced {
        #[cfg(target_os = "linux")]
        {
            let dir = setup_cgroup(
                _cgroup_root,
                &task.task_id,
                pid as i32,
                &execution_plan.resource_enforcement,
            )
            .map_err(|err| AppError::SandboxSetup(format!("configure cgroup: {err}")))?;
            Some(dir)
        }
        #[cfg(not(target_os = "linux"))]
        {
            None
        }
    } else {
        None
    };

    Ok(SpawnedProcess {
        pid,
        pgid,
        script_path,
        cgroup_dir,
    })
}

/// build_command 根据 command/script 任务形态构造可执行命令 / builds the executable command for either command-style or script-style tasks.
fn build_command(
    task: &TaskRecord,
    stdout_file: File,
    stderr_file: File,
) -> AppResult<(StdCommand, Option<PathBuf>)> {
    let env = minimal_env(&task.execution.env);
    let workspace = task.workspace_dir.clone();
    fs::create_dir_all(&workspace)?;

    let (mut command, script_path) = match task.execution.kind {
        ExecutionKind::Command => {
            let program = task
                .execution
                .program
                .as_deref()
                .ok_or_else(|| AppError::InvalidInput("execution.program missing".into()))?;
            let mut cmd = StdCommand::new(program);
            cmd.args(&task.execution.args);
            (cmd, None)
        }
        ExecutionKind::Script => {
            let script = task
                .execution
                .script
                .as_ref()
                .ok_or_else(|| AppError::InvalidInput("execution.script missing".into()))?;
            let path = task
                .script_path
                .clone()
                .unwrap_or_else(|| task.task_dir.join("script.sh"));
            write_script_file(&path, script)?;

            let cmd = if let Some(interpreter) = &task.execution.interpreter {
                let mut command = StdCommand::new(&interpreter[0]);
                command.args(&interpreter[1..]);
                command.arg(&path);
                command
            } else {
                let mut command = StdCommand::new("/bin/sh");
                command.arg("-c").arg(script);
                command
            };
            (cmd, Some(path))
        }
    };

    command
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .current_dir(workspace)
        .env_clear();

    for (key, value) in env {
        command.env(key, value);
    }
    Ok((command, script_path))
}

/// supervise_wait 负责等待进程退出，并处理超时、取消和信号升级 / waits for process completion while handling timeout, cancellation, and signal escalation.
async fn supervise_wait(
    repo: &Repository,
    task: &TaskRecord,
    wait_handle: JoinHandle<AppResult<WaitUsage>>,
    termination_grace_ms: u64,
    wall_time_ms: u64,
    pgid: i32,
    cgroup_dir: Option<&Path>,
) -> AppResult<WaitOutcome> {
    let start = Instant::now();
    let mut wait_handle = std::pin::pin!(wait_handle);
    let mut poll = tokio::time::interval(Duration::from_millis(250));
    let mut timeout_started: Option<Instant> = None;
    let mut cancel_started: Option<Instant> = None;
    let mut term_sent = false;
    let mut kill_sent = false;

    loop {
        tokio::select! {
            result = &mut wait_handle => {
                let usage = result
                    .map_err(|err| AppError::Internal(format!("wait join error: {err}")))??;
                let duration_ms = start.elapsed().as_millis() as u64;
                let cancel_requested = cancel_started.is_some() || repo.is_cancel_requested(&task.task_id)?;
                return Ok(WaitOutcome {
                    completion: classify_completion(
                        task,
                        usage,
                        duration_ms,
                        timeout_started.is_some(),
                        cancel_requested,
                        cgroup_dir,
                    ),
                });
            }
            _ = poll.tick() => {
                let cancel_requested = repo.is_cancel_requested(&task.task_id)?;
                if timeout_started.is_none() && start.elapsed() >= Duration::from_millis(wall_time_ms) {
                    repo.mark_timeout_triggered(&task.task_id)?;
                    timeout_started = Some(Instant::now());
                }
                if cancel_requested && cancel_started.is_none() {
                    cancel_started = Some(Instant::now());
                }

                if (timeout_started.is_some() || cancel_started.is_some()) && !term_sent {
                    let _ = killpg(Pid::from_raw(pgid), Signal::SIGTERM);
                    term_sent = true;
                }

                let should_escalate = timeout_started
                    .map(|started| started.elapsed() >= Duration::from_millis(termination_grace_ms))
                    .unwrap_or(false)
                    || cancel_started
                        .map(|started| started.elapsed() >= Duration::from_millis(termination_grace_ms))
                        .unwrap_or(false);

                if should_escalate && !kill_sent {
                    let _ = killpg(Pid::from_raw(pgid), Signal::SIGKILL);
                    kill_sent = true;
                }
            }
        }
    }
}

/// WaitUsage 汇总 wait4 返回的退出码和资源使用数据 / summarizes exit codes and resource usage returned by wait4.
#[derive(Debug)]
struct WaitUsage {
    exit_code: Option<i32>,
    exit_signal: Option<i32>,
    user_cpu_ms: Option<u64>,
    system_cpu_ms: Option<u64>,
    max_rss_bytes: Option<u64>,
}

/// classify_completion 将 wait 结果映射为持久化终态 / maps wait results into the persisted terminal state.
fn classify_completion(
    _task: &TaskRecord,
    usage: WaitUsage,
    duration_ms: u64,
    timed_out: bool,
    cancelled: bool,
    cgroup_dir: Option<&Path>,
) -> CompletionUpdate {
    let mut usage_payload = ResourceUsage {
        duration_ms,
        user_cpu_ms: usage.user_cpu_ms,
        system_cpu_ms: usage.system_cpu_ms,
        max_rss_bytes: usage.max_rss_bytes,
        memory_peak_bytes: read_memory_peak_bytes(cgroup_dir),
    };

    let (status, error) = if timed_out {
        (
            TaskStatus::Failed,
            Some(RuntimeErrorInfo {
                code: ErrorCode::Timeout,
                message: "task exceeded wall_time_ms".into(),
                details: None,
            }),
        )
    } else if cancelled {
        (
            TaskStatus::Cancelled,
            Some(RuntimeErrorInfo {
                code: ErrorCode::Cancelled,
                message: "task cancelled".into(),
                details: None,
            }),
        )
    } else if oom_killed(cgroup_dir) {
        (
            TaskStatus::Failed,
            Some(RuntimeErrorInfo {
                code: ErrorCode::MemoryLimitExceeded,
                message: "task exceeded memory limit".into(),
                details: None,
            }),
        )
    } else if usage.exit_signal == Some(libc::SIGXCPU) {
        (
            TaskStatus::Failed,
            Some(RuntimeErrorInfo {
                code: ErrorCode::CpuLimitExceeded,
                message: "task exceeded cpu_time_sec".into(),
                details: None,
            }),
        )
    } else if usage.exit_code == Some(0) {
        (TaskStatus::Success, None)
    } else if let Some(code) = usage.exit_code {
        (
            TaskStatus::Failed,
            Some(RuntimeErrorInfo {
                code: ErrorCode::ExitNonZero,
                message: format!("task exited with code {code}"),
                details: None,
            }),
        )
    } else if let Some(signal) = usage.exit_signal {
        (
            TaskStatus::Failed,
            Some(RuntimeErrorInfo {
                code: ErrorCode::Internal,
                message: format!("task terminated by signal {signal}"),
                details: None,
            }),
        )
    } else {
        (
            TaskStatus::Failed,
            Some(RuntimeErrorInfo {
                code: ErrorCode::Internal,
                message: "task failed with unknown outcome".into(),
                details: None,
            }),
        )
    };

    if usage_payload.duration_ms == 0 {
        usage_payload.duration_ms = duration_ms;
    }

    CompletionUpdate {
        status,
        finished_at: Utc::now(),
        duration_ms: Some(duration_ms),
        exit_code: usage.exit_code,
        exit_signal: usage.exit_signal,
        error,
        usage: Some(usage_payload),
        result_json: None,
    }
}

/// build_status_response 组装对外暴露的任务状态响应 / assembles the externally exposed task status response.
fn build_status_response(task: &TaskRecord) -> AppResult<TaskStatusResponse> {
    let (stdout, stdout_truncated) = read_output_preview(&task.stdout_path, task.stdout_max_bytes)?;
    let (stderr, stderr_truncated) = read_output_preview(&task.stderr_path, task.stderr_max_bytes)?;
    let duration_ms = task.duration_ms.or_else(|| {
        task.started_at
            .map(|started_at| (Utc::now() - started_at).num_milliseconds().max(0) as u64)
    });
    Ok(TaskStatusResponse {
        task_id: task.task_id.clone(),
        handle_id: task.handle_id.clone(),
        status: task.status.clone(),
        created_at: task.created_at,
        updated_at: task.updated_at,
        started_at: task.started_at,
        finished_at: task.finished_at,
        duration_ms,
        shim_pid: task.shim_pid,
        pid: task.pid,
        pgid: task.pgid,
        exit_code: task.exit_code,
        exit_signal: task.exit_signal,
        stdout,
        stderr,
        stdout_truncated,
        stderr_truncated,
        error: task.error.clone(),
        usage: task.usage.clone().or_else(|| {
            duration_ms.map(|value| ResourceUsage {
                duration_ms: value,
                user_cpu_ms: None,
                system_cpu_ms: None,
                max_rss_bytes: None,
                memory_peak_bytes: None,
            })
        }),
        execution_plan: task
            .execution_plan
            .clone()
            .or_else(|| Some(legacy_execution_plan(task))),
        reservation: task.reservation.clone(),
        artifacts: TaskArtifacts {
            task_dir: task.task_dir.to_string_lossy().to_string(),
            request_path: task.request_path.to_string_lossy().to_string(),
            result_path: task.result_path.to_string_lossy().to_string(),
            stdout_path: task.stdout_path.to_string_lossy().to_string(),
            stderr_path: task.stderr_path.to_string_lossy().to_string(),
            script_path: task
                .script_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
        },
        metadata: task.metadata.clone(),
    })
}

/// legacy_execution_plan 为缺少 execution_plan 的旧记录构造兼容计划 / builds a compatible plan for older records that do not store execution_plan.
fn legacy_execution_plan(task: &TaskRecord) -> ExecutionPlan {
    ExecutionPlan::legacy(task.sandbox.clone(), task.limits.clone())
}

/// add_reservation 将单个预留叠加到当前保留容量 / adds one reservation into the current reserved capacity.
fn add_reservation(current: &mut ResourceCapacity, reservation: &TaskResourceReservation) {
    current.task_slots = current.task_slots.saturating_add(reservation.task_slots);
    if let Some(value) = reservation.memory_bytes {
        current.memory_bytes = Some(current.memory_bytes.unwrap_or(0).saturating_add(value));
    }
    if let Some(value) = reservation.pids {
        current.pids = Some(current.pids.unwrap_or(0).saturating_add(value));
    }
}

/// subtract_reservation 从当前保留容量中扣减单个预留 / subtracts one reservation from the current reserved capacity.
fn subtract_reservation(current: &mut ResourceCapacity, reservation: &TaskResourceReservation) {
    current.task_slots = current.task_slots.saturating_sub(reservation.task_slots);
    if let Some(value) = reservation.memory_bytes {
        current.memory_bytes = current
            .memory_bytes
            .map(|reserved| reserved.saturating_sub(value));
    }
    if let Some(value) = reservation.pids {
        current.pids = current.pids.map(|reserved| reserved.saturating_sub(value));
    }
}

/// persist_latest_result 将最新任务状态快照写入 result.json / writes the latest task status snapshot into result.json.
fn persist_latest_result(repo: &Repository, task_id: &str) -> AppResult<()> {
    let task = repo.get_task(task_id)?;
    let response = build_status_response(&task)?;
    write_json_file(&task.result_path, &response)?;
    Ok(())
}

/// signal_task_termination 向任务进程组或单进程发送信号 / sends a signal to the task process group or single process.
fn signal_task_termination(task: &TaskRecord, signal: Signal) -> AppResult<()> {
    if let Some(pgid) = task.pgid {
        killpg(Pid::from_raw(pgid), signal)
            .map_err(|err| AppError::Internal(format!("signal process group: {err}")))?;
    } else if let Some(pid) = task.pid {
        kill(Pid::from_raw(pid as i32), signal)
            .map_err(|err| AppError::Internal(format!("signal process: {err}")))?;
    }
    Ok(())
}

/// infer_script_name 根据解释器推断脚本文件扩展名 / infers the script filename extension from the interpreter.
fn infer_script_name(interpreter: Option<&str>) -> &'static str {
    match interpreter.unwrap_or_default() {
        value if value.contains("python") => "script.py",
        value if value.contains("bash") => "script.sh",
        value if value.contains("zsh") => "script.zsh",
        value if value.contains("node") => "script.js",
        _ => "script.sh",
    }
}

/// write_script_file 以可执行权限写入脚本文件 / writes the script file with executable permissions.
fn write_script_file(path: &Path, script: &str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o700)
        .open(path)?;
    file.write_all(script.as_bytes())?;
    Ok(())
}

/// read_output_preview 读取 stdout/stderr 的内联预览片段 / reads an inline preview of stdout or stderr.
fn read_output_preview(path: &Path, max_bytes: u64) -> AppResult<(String, bool)> {
    match File::open(path) {
        Ok(mut file) => {
            let len = file.metadata()?.len();
            let mut buffer = vec![0; max_bytes as usize];
            let read = file.read(&mut buffer)?;
            buffer.truncate(read);
            Ok((
                String::from_utf8_lossy(&buffer).to_string(),
                len > max_bytes,
            ))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok((String::new(), false)),
        Err(err) => Err(AppError::Io(err)),
    }
}

/// write_json_file 将 JSON 结果落盘到目标路径 / writes a JSON result to the target path.
fn write_json_file(path: &Path, value: &impl serde::Serialize) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_vec_pretty(value)?;
    fs::write(path, json)?;
    Ok(())
}

/// touch_file 确保输出文件存在 / ensures that an output file exists.
fn touch_file(path: &Path) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let _ = OpenOptions::new().create(true).append(true).open(path)?;
    Ok(())
}

/// open_output_file 打开并截断 stdout/stderr 输出文件 / opens and truncates the stdout or stderr output file.
fn open_output_file(path: &Path) -> AppResult<File> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o644)
        .open(path)
        .map_err(AppError::Io)
}

/// minimal_env 构造最小可运行环境并叠加任务自定义变量 / builds a minimal runnable environment and overlays task-specific variables.
fn minimal_env(extra: &std::collections::HashMap<String, String>) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    for key in ["PATH", "HOME", "LANG", "TMPDIR", "USER"] {
        if let Ok(value) = std::env::var(key) {
            env.insert(key.to_string(), value);
        }
    }
    env.extend(
        extra
            .iter()
            .map(|(key, value)| (key.clone(), value.clone())),
    );
    env
}

/// apply_resource_enforcement 在子进程 pre_exec 阶段应用 rlimit 约束 / applies rlimit enforcement during child pre_exec.
fn apply_resource_enforcement(enforcement: &ResourceEnforcementPlan) -> nix::Result<()> {
    if enforcement.cpu_time_enforced {
        if let Some(cpu_time_sec) = enforcement.cpu_time_sec {
            setrlimit(
                Resource::RLIMIT_CPU,
                cpu_time_sec as rlim_t,
                cpu_time_sec as rlim_t,
            )?;
        }
    }
    if enforcement.memory_enforced {
        if let Some(memory_bytes) = enforcement.memory_bytes {
            setrlimit(
                Resource::RLIMIT_AS,
                memory_bytes as rlim_t,
                memory_bytes as rlim_t,
            )?;
        }
    }
    Ok(())
}

/// apply_rlimits 是旧测试路径使用的直接 rlimit 应用函数 / is the direct rlimit helper kept for older test paths.
#[allow(dead_code)]
fn apply_rlimits(limits: &crate::types::ResourceLimits) -> nix::Result<()> {
    if let Some(cpu_time_sec) = limits.cpu_time_sec {
        setrlimit(
            Resource::RLIMIT_CPU,
            cpu_time_sec as rlim_t,
            cpu_time_sec as rlim_t,
        )?;
    }
    if let Some(memory_bytes) = limits.memory_bytes {
        setrlimit(
            Resource::RLIMIT_AS,
            memory_bytes as rlim_t,
            memory_bytes as rlim_t,
        )?;
    }
    Ok(())
}

/// apply_linux_sandbox 在 Linux 上应用 namespace 和 chroot 隔离 / applies namespace and chroot isolation on Linux.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
#[cfg(target_os = "linux")]
fn apply_linux_sandbox(
    sandbox: &crate::types::SandboxPolicy,
    rootfs: Option<&str>,
) -> nix::Result<()> {
    use nix::sched::{unshare, CloneFlags};

    if matches!(sandbox.profile, crate::types::SandboxProfile::LinuxSandbox) {
        let namespaces = sandbox.effective_namespaces();
        let mut flags = CloneFlags::empty();
        if namespaces.mount {
            flags |= CloneFlags::CLONE_NEWNS;
        }
        if namespaces.pid {
            flags |= CloneFlags::CLONE_NEWPID;
        }
        if namespaces.uts {
            flags |= CloneFlags::CLONE_NEWUTS;
        }
        if namespaces.ipc {
            flags |= CloneFlags::CLONE_NEWIPC;
        }
        if namespaces.net {
            flags |= CloneFlags::CLONE_NEWNET;
        }
        if !flags.is_empty() {
            unshare(flags)?;
        }
        if sandbox.chroot {
            if let Some(root) = rootfs {
                chroot(root)?;
                chdir("/")?;
            }
        }
    }
    Ok(())
}

/// apply_linux_sandbox 在非 Linux 主机上退化为空操作 / degrades to a no-op on non-Linux hosts.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
#[cfg(not(target_os = "linux"))]
fn apply_linux_sandbox(
    _sandbox: &crate::types::SandboxPolicy,
    _rootfs: Option<&str>,
) -> nix::Result<()> {
    Ok(())
}

/// setup_cgroup 为任务创建并配置 cgroup 目录 / creates and configures the cgroup directory for a task.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
#[cfg(target_os = "linux")]
fn setup_cgroup(
    cgroup_root: &Path,
    task_id: &str,
    pid: i32,
    enforcement: &ResourceEnforcementPlan,
) -> AppResult<PathBuf> {
    let dir = cgroup_root.join(task_id);
    fs::create_dir_all(&dir)?;
    if enforcement.memory_enforced {
        if let Some(memory_bytes) = enforcement.memory_bytes {
            fs::write(dir.join("memory.max"), memory_bytes.to_string())?;
        }
    }
    if enforcement.pids_enforced {
        if let Some(pids_max) = enforcement.pids_max {
            fs::write(dir.join("pids.max"), pids_max.to_string())?;
        }
    }
    fs::write(dir.join("cgroup.procs"), pid.to_string())?;
    Ok(dir)
}

/// setup_cgroup 在非 Linux 主机上返回不支持错误 / returns an unsupported error on non-Linux hosts.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
#[cfg(not(target_os = "linux"))]
fn setup_cgroup(
    _cgroup_root: &Path,
    _task_id: &str,
    _pid: i32,
    _enforcement: &ResourceEnforcementPlan,
) -> AppResult<PathBuf> {
    Err(AppError::SandboxSetup(
        "linux-sandbox requires a Linux host".into(),
    ))
}

/// read_memory_peak_bytes 读取 cgroup 记录的内存峰值 / reads the memory peak recorded by the cgroup.
fn read_memory_peak_bytes(_cgroup_dir: Option<&Path>) -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        let cgroup_dir = _cgroup_dir;
        if let Some(cgroup_dir) = cgroup_dir {
            let path = cgroup_dir.join("memory.peak");
            if let Ok(value) = fs::read_to_string(path) {
                return value.trim().parse::<u64>().ok();
            }
        }
    }
    None
}

/// oom_killed 读取 cgroup memory.events 判断是否发生 OOM kill / checks cgroup memory.events to determine whether an OOM kill occurred.
fn oom_killed(_cgroup_dir: Option<&Path>) -> bool {
    #[cfg(target_os = "linux")]
    {
        let cgroup_dir = _cgroup_dir;
        if let Some(cgroup_dir) = cgroup_dir {
            let path = cgroup_dir.join("memory.events");
            if let Ok(contents) = fs::read_to_string(path) {
                for line in contents.lines() {
                    let mut parts = line.split_whitespace();
                    if matches!(parts.next(), Some("oom_kill"))
                        && parts
                            .next()
                            .and_then(|value| value.parse::<u64>().ok())
                            .unwrap_or_default()
                            > 0
                    {
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// wait_for_pid 使用 wait4 等待指定 PID 并收集资源使用数据 / waits for the given PID with wait4 and collects resource usage.
fn wait_for_pid(pid: i32) -> AppResult<WaitUsage> {
    let mut status: libc::c_int = 0;
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::zeroed();
    let wait_result = loop {
        let rc = unsafe { libc::wait4(pid, &mut status, 0, usage.as_mut_ptr()) };
        if rc == -1 {
            let err = std::io::Error::last_os_error();
            if err.kind() == std::io::ErrorKind::Interrupted {
                continue;
            }
            return Err(AppError::Io(err));
        }
        break rc;
    };

    if wait_result <= 0 {
        return Err(AppError::Internal("wait4 returned no child".into()));
    }

    let usage = unsafe { usage.assume_init() };
    let exit_code = if libc::WIFEXITED(status) {
        Some(libc::WEXITSTATUS(status))
    } else {
        None
    };
    let exit_signal = if libc::WIFSIGNALED(status) {
        Some(libc::WTERMSIG(status))
    } else {
        None
    };

    Ok(WaitUsage {
        exit_code,
        exit_signal,
        user_cpu_ms: Some(timeval_to_ms(usage.ru_utime)),
        system_cpu_ms: Some(timeval_to_ms(usage.ru_stime)),
        max_rss_bytes: Some(convert_max_rss(usage.ru_maxrss)),
    })
}

/// timeval_to_ms 将 libc timeval 转成毫秒 / converts a libc timeval into milliseconds.
fn timeval_to_ms(tv: libc::timeval) -> u64 {
    (tv.tv_sec.max(0) as u64)
        .saturating_mul(1000)
        .saturating_add((tv.tv_usec.max(0) as u64) / 1000)
}

/// convert_max_rss 将 Linux ru_maxrss 转为字节 / converts Linux ru_maxrss into bytes.
#[cfg(target_os = "linux")]
fn convert_max_rss(value: libc::c_long) -> u64 {
    (value.max(0) as u64).saturating_mul(1024)
}

/// convert_max_rss 在非 Linux 上直接返回 ru_maxrss 原值 / returns the raw ru_maxrss value on non-Linux hosts.
#[cfg(not(target_os = "linux"))]
fn convert_max_rss(value: libc::c_long) -> u64 {
    value.max(0) as u64
}

/// load_request 从文件或内联 JSON 读取提交请求 / loads a submit request from a file or inline JSON.
fn load_request(args: &RemoteTaskArgs) -> AppResult<SubmitTaskRequest> {
    let raw = if let Some(file) = &args.file {
        fs::read_to_string(file)?
    } else {
        args.json.clone().unwrap_or_default()
    };
    Ok(serde_json::from_str(&raw)?)
}

/// http_client 构造默认 HTTP client / builds the default HTTP client.
fn http_client() -> Client {
    Client::builder().build().unwrap_or_else(|_| Client::new())
}

/// trim_server 去除 server 地址末尾斜杠 / trims trailing slashes from the server address.
fn trim_server(server: &str) -> &str {
    server.trim_end_matches('/')
}

/// parse_tenant_quota 解析 "name=slots:N[,memory:BYTES][,pids:N]" 格式的租户配额规格 / parses a "name=slots:N[,memory:BYTES][,pids:N]" tenant quota specification.
fn parse_tenant_quota(raw: &str) -> AppResult<(String, ResourceCapacity)> {
    let (name_part, spec_part) = raw.split_once('=').ok_or_else(|| {
        AppError::InvalidInput(format!(
            "tenant-quota '{raw}': expected format name=slots:N[,memory:BYTES][,pids:N]"
        ))
    })?;
    let name = name_part.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidInput(
            "tenant-quota: tenant name must not be empty".into(),
        ));
    }
    let mut task_slots: Option<u64> = None;
    let mut memory_bytes: Option<u64> = None;
    let mut pids: Option<u64> = None;
    for kv in spec_part.split(',') {
        let kv = kv.trim();
        if kv.is_empty() {
            continue;
        }
        let (key, val) = kv.split_once(':').ok_or_else(|| {
            AppError::InvalidInput(format!("tenant-quota '{raw}': malformed key-value '{kv}'"))
        })?;
        let val = val.trim();
        match key.trim() {
            "slots" => {
                task_slots = Some(val.parse::<u64>().map_err(|_| {
                    AppError::InvalidInput(format!(
                        "tenant-quota '{raw}': slots value '{val}' is not a valid u64"
                    ))
                })?);
            }
            "memory" => {
                memory_bytes = Some(val.parse::<u64>().map_err(|_| {
                    AppError::InvalidInput(format!(
                        "tenant-quota '{raw}': memory value '{val}' is not a valid u64"
                    ))
                })?);
            }
            "pids" => {
                pids = Some(val.parse::<u64>().map_err(|_| {
                    AppError::InvalidInput(format!(
                        "tenant-quota '{raw}': pids value '{val}' is not a valid u64"
                    ))
                })?);
            }
            other => {
                return Err(AppError::InvalidInput(format!(
                    "tenant-quota '{raw}': unknown key '{other}'"
                )));
            }
        }
    }
    let task_slots = task_slots.ok_or_else(|| {
        AppError::InvalidInput(format!("tenant-quota '{raw}': 'slots' is required"))
    })?;
    Ok((
        name,
        ResourceCapacity {
            task_slots,
            memory_bytes,
            pids,
        },
    ))
}

/// default_runtime_id 从主机名和监听地址生成默认 runtime_id / generates the default runtime_id from hostname and listen address.
fn default_runtime_id(listen_addr: &str) -> String {
    let host = std::env::var("HOSTNAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "execgo-runtime".into());
    format!(
        "{}-{}",
        sanitize_runtime_id(&host),
        sanitize_runtime_id(listen_addr)
    )
}

/// sanitize_runtime_id 将 runtime_id 候选值规范为安全字符集 / normalizes a runtime_id candidate into a safe character set.
fn sanitize_runtime_id(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

/// print_json_response 打印 HTTP 响应体，并在非 2xx 时返回错误 / prints the HTTP response body and returns an error on non-2xx statuses.
async fn print_json_response(response: reqwest::Response) -> AppResult<()> {
    let status = response.status();
    let body = response.text().await?;
    println!("{body}");
    if status.is_success() {
        Ok(())
    } else {
        Err(AppError::Internal(format!(
            "request failed with status {status}"
        )))
    }
}

/// process_exists 通过空信号探测进程是否仍存在 / probes whether a process still exists via a null signal.
fn process_exists(pid: i32) -> bool {
    if pid <= 0 {
        return false;
    }
    kill(Pid::from_raw(pid), None).is_ok()
}

/// nix_to_io 将 nix 错误转为 std::io::Error / converts a nix error into std::io::Error.
fn nix_to_io(err: nix::Error) -> std::io::Error {
    std::io::Error::other(err.to_string())
}

/// init_tracing 初始化 JSON tracing 输出 / initializes JSON tracing output.
fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .json()
        .try_init();
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, HashMap};

    use tempfile::TempDir;

    use super::*;
    use crate::types::{ExecutionKind, ExecutionSpec, ResourceLimits, SandboxPolicy};

    #[test]
    fn minimal_env_keeps_common_keys_and_overrides() {
        let mut extra = HashMap::new();
        extra.insert("FOO".to_string(), "bar".to_string());
        let env = minimal_env(&extra);
        assert_eq!(env.get("FOO").map(String::as_str), Some("bar"));
    }

    #[tokio::test]
    async fn status_response_reads_inline_output() {
        let temp = TempDir::new().unwrap();
        let stdout_path = temp.path().join("stdout.log");
        let stderr_path = temp.path().join("stderr.log");
        fs::write(&stdout_path, "hello world").unwrap();
        fs::write(&stderr_path, "oops").unwrap();

        let task = TaskRecord {
            task_id: "t1".into(),
            handle_id: "t1".into(),
            status: TaskStatus::Success,
            execution: ExecutionSpec {
                kind: ExecutionKind::Command,
                program: Some("echo".into()),
                args: vec![],
                script: None,
                interpreter: None,
                env: HashMap::new(),
            },
            limits: ResourceLimits::default(),
            sandbox: SandboxPolicy::default(),
            metadata: BTreeMap::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            started_at: None,
            finished_at: None,
            duration_ms: Some(1),
            shim_pid: None,
            pid: None,
            pgid: None,
            exit_code: Some(0),
            exit_signal: None,
            error_code: None,
            error: None,
            usage: None,
            task_dir: temp.path().to_path_buf(),
            workspace_dir: temp.path().join("workspace"),
            request_path: temp.path().join("request.json"),
            result_path: temp.path().join("result.json"),
            stdout_path,
            stderr_path,
            script_path: None,
            stdout_max_bytes: 1024,
            stderr_max_bytes: 1024,
            kill_requested: false,
            kill_requested_at: None,
            timeout_triggered: false,
            result_json: None,
            execution_plan: None,
            control_context: None,
            reservation: None,
            reserved_at: None,
            released_at: None,
        };

        let response = build_status_response(&task).unwrap();
        assert_eq!(response.stdout, "hello world");
        assert_eq!(response.stderr, "oops");
    }

    #[test]
    fn infer_script_name_follows_interpreter() {
        assert_eq!(infer_script_name(Some("python3")), "script.py");
        assert_eq!(infer_script_name(Some("bash")), "script.sh");
    }
}
