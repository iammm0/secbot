//! Prometheus 指标渲染 / Prometheus metrics rendering.
// Author: iammm0; Last edited: 2026-04-23

use crate::repo::MetricsSnapshot;

const BUCKETS_MS: &[u64] = &[100, 250, 500, 1_000, 5_000, 10_000, 30_000, 60_000, 300_000];

/// render_prometheus 将仓储指标快照渲染为 Prometheus 文本格式 / renders a repository metrics snapshot into Prometheus text format.
pub fn render_prometheus(snapshot: &MetricsSnapshot) -> String {
    let mut out = String::new();
    out.push_str(
        "# HELP execgo_runtime_tasks_total Total tasks by terminal and in-flight status\n",
    );
    out.push_str("# TYPE execgo_runtime_tasks_total counter\n");
    for (status, count) in &snapshot.by_status {
        out.push_str(&format!(
            "execgo_runtime_tasks_total{{status=\"{}\"}} {}\n",
            status, count
        ));
    }

    let running = snapshot
        .by_status
        .get("running")
        .copied()
        .unwrap_or_default();
    out.push_str("# HELP execgo_runtime_tasks_running Tasks currently running\n");
    out.push_str("# TYPE execgo_runtime_tasks_running gauge\n");
    out.push_str(&format!("execgo_runtime_tasks_running {}\n", running));

    out.push_str("# HELP execgo_runtime_task_errors_total Total tasks by error code\n");
    out.push_str("# TYPE execgo_runtime_task_errors_total counter\n");
    for (code, count) in &snapshot.by_error_code {
        out.push_str(&format!(
            "execgo_runtime_task_errors_total{{code=\"{}\"}} {}\n",
            code, count
        ));
    }

    out.push_str(
        "# HELP execgo_runtime_task_duration_ms Task duration histogram in milliseconds\n",
    );
    out.push_str("# TYPE execgo_runtime_task_duration_ms histogram\n");
    let mut sorted = snapshot.finished_durations_ms.clone();
    sorted.sort_unstable();
    let sum: u64 = sorted.iter().copied().fold(0u64, u64::saturating_add);
    for bucket in BUCKETS_MS {
        let count = sorted.partition_point(|d| *d <= *bucket) as u64;
        out.push_str(&format!(
            "execgo_runtime_task_duration_ms_bucket{{le=\"{}\"}} {}\n",
            bucket, count
        ));
    }
    out.push_str(&format!(
        "execgo_runtime_task_duration_ms_bucket{{le=\"+Inf\"}} {}\n",
        sorted.len()
    ));
    out.push_str(&format!("execgo_runtime_task_duration_ms_sum {}\n", sum));
    out.push_str(&format!(
        "execgo_runtime_task_duration_ms_count {}\n",
        sorted.len()
    ));
    out
}
