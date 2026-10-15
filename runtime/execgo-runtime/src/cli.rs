//! execgo-runtime 的命令行参数与子命令定义 / CLI arguments and subcommand definitions for execgo-runtime.
// Author: iammm0; Last edited: 2026-04-23

use std::{path::PathBuf, time::Duration};

use clap::{ArgGroup, Args, Parser, Subcommand};

use crate::types::CapabilityMode;

/// Cli 是 execgo-runtime 的顶层命令行入口 / is the top-level command-line entrypoint for execgo-runtime.
#[derive(Debug, Parser)]
#[command(name = "execgo-runtime", version, about = "ExecGo runtime data plane")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

/// Command 定义 runtime 支持的 CLI 子命令集合 / defines the CLI subcommands supported by the runtime.
#[derive(Debug, Subcommand)]
pub enum Command {
    Serve(ServeArgs),
    Submit(RemoteTaskArgs),
    Status(StatusArgs),
    Wait(WaitArgs),
    Kill(KillArgs),
    Run(RemoteTaskArgs),
    #[command(hide = true, name = "internal-shim")]
    InternalShim(InternalShimArgs),
}

/// ServeArgs 描述启动 runtime server 所需的本地配置 / describes the local configuration required to start the runtime server.
#[derive(Debug, Clone, Args)]
pub struct ServeArgs {
    #[arg(long, default_value = "127.0.0.1:8080")]
    pub listen_addr: String,
    #[arg(long, default_value = "data")]
    pub data_dir: PathBuf,
    #[arg(long, default_value = "4")]
    pub max_running_tasks: usize,
    #[arg(long, default_value = "128")]
    pub max_queued_tasks: usize,
    #[arg(long, default_value = "5000")]
    pub termination_grace_ms: u64,
    #[arg(long, default_value = "604800")]
    pub result_retention_secs: u64,
    #[arg(long, default_value = "1000")]
    pub gc_interval_ms: u64,
    #[arg(long, default_value = "250")]
    pub dispatch_poll_interval_ms: u64,
    #[arg(long, default_value = "/sys/fs/cgroup/execgo-runtime")]
    pub cgroup_root: PathBuf,
    #[arg(long, env = "EXECGO_RUNTIME_ID")]
    pub runtime_id: Option<String>,
    #[arg(
        long,
        env = "EXECGO_RUNTIME_DEFAULT_CAPABILITY_MODE",
        default_value = "adaptive"
    )]
    pub default_capability_mode: CapabilityMode,
    #[arg(
        long,
        env = "EXECGO_RUNTIME_DISABLE_LINUX_SANDBOX",
        default_value_t = false
    )]
    pub disable_linux_sandbox: bool,
    #[arg(long, env = "EXECGO_RUNTIME_DISABLE_CGROUP", default_value_t = false)]
    pub disable_cgroup: bool,
    #[arg(long, env = "EXECGO_RUNTIME_CAPACITY_MEMORY_BYTES")]
    pub capacity_memory_bytes: Option<u64>,
    #[arg(long, env = "EXECGO_RUNTIME_CAPACITY_PIDS")]
    pub capacity_pids: Option<u64>,
    /// Repeatable tenant quota, e.g. --tenant-quota alice=slots:4,memory:2147483648,pids:256
    /// 可重复使用的租户配额参数 / Repeatable per-tenant soft quota specification.
    #[arg(long = "tenant-quota", value_name = "SPEC", action = clap::ArgAction::Append)]
    pub tenant_quota: Vec<String>,
}

/// RemoteTaskArgs 描述面向远端 runtime 的 submit/run 输入 / describes submit/run input for a remote runtime.
#[derive(Debug, Clone, Args)]
#[command(group(
    ArgGroup::new("input")
        .required(true)
        .args(["file", "json"])
))]
pub struct RemoteTaskArgs {
    #[arg(long, default_value = "http://127.0.0.1:8080")]
    pub server: String,
    #[arg(long)]
    pub file: Option<PathBuf>,
    #[arg(long)]
    pub json: Option<String>,
    #[arg(long, default_value = "500")]
    pub poll_interval_ms: u64,
    #[arg(long)]
    pub timeout_ms: Option<u64>,
}

/// StatusArgs 描述面向远端 runtime 的单任务查询参数 / describes single-task query arguments for a remote runtime.
#[derive(Debug, Clone, Args)]
pub struct StatusArgs {
    #[arg(long, default_value = "http://127.0.0.1:8080")]
    pub server: String,
    pub task_id: String,
}

/// KillArgs 描述面向远端 runtime 的取消请求参数 / describes arguments for a remote runtime kill request.
#[derive(Debug, Clone, Args)]
pub struct KillArgs {
    #[arg(long, default_value = "http://127.0.0.1:8080")]
    pub server: String,
    #[arg(long, env = "EXECGO_RUNTIME_OWNER")]
    pub owner: Option<String>,
    pub task_id: String,
}

/// WaitArgs 描述轮询远端任务终态所需参数 / describes the arguments needed to poll a remote task until terminal state.
#[derive(Debug, Clone, Args)]
pub struct WaitArgs {
    #[arg(long, default_value = "http://127.0.0.1:8080")]
    pub server: String,
    pub task_id: String,
    #[arg(long)]
    pub timeout_ms: Option<u64>,
    #[arg(long, default_value = "500")]
    pub poll_interval_ms: u64,
}

/// InternalShimArgs 描述内部 shim 子进程需要的最小上下文 / describes the minimum context required by the internal shim subprocess.
#[derive(Debug, Clone, Args)]
pub struct InternalShimArgs {
    #[arg(long)]
    pub database: PathBuf,
    #[arg(long)]
    pub data_dir: PathBuf,
    #[arg(long)]
    pub task_id: String,
    #[arg(long)]
    pub termination_grace_ms: u64,
    #[arg(long)]
    pub cgroup_root: PathBuf,
}

impl WaitArgs {
    /// timeout 将可选毫秒超时转为 Duration / converts the optional millisecond timeout into a Duration.
    pub fn timeout(&self) -> Option<Duration> {
        self.timeout_ms.map(Duration::from_millis)
    }
}
