//! execgo-runtime 的二进制入口：解析 CLI 并委托给 runtime / execgo-runtime binary entrypoint: parse CLI and delegate into runtime.
// Author: iammm0; Last edited: 2026-04-23

use clap::Parser;
use execgo_runtime::{cli::Cli, runtime};

/// main 解析 CLI 并把执行交给 runtime 入口 / parses the CLI and delegates execution to the runtime entrypoint.
#[tokio::main]
async fn main() {
    if let Err(err) = runtime::run(Cli::parse()).await {
        eprintln!("{err}");
        std::process::exit(1);
    }
}
