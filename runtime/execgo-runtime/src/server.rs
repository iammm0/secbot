//! 对外 HTTP API 路由组装（axum）/ External HTTP API router assembly (axum).
// Author: iammm0; Last edited: 2026-04-23

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};

use crate::{
    error::AppError,
    runtime::RuntimeService,
    types::{HealthResponse, SubmitTaskRequest},
};

/// build_router 组装 runtime 对外暴露的 HTTP 路由树 / assembles the HTTP router exposed by the runtime.
pub fn build_router(service: RuntimeService) -> Router {
    Router::new()
        .route("/api/v1/tasks", post(create_task))
        .route("/api/v1/tasks/:id", get(get_task))
        .route("/api/v1/tasks/:id/kill", post(kill_task))
        .route("/api/v1/tasks/:id/events", get(get_events))
        .route("/api/v1/runtime/info", get(runtime_info))
        .route("/api/v1/runtime/capabilities", get(runtime_capabilities))
        .route("/api/v1/runtime/config", get(runtime_config))
        .route("/api/v1/runtime/resources", get(runtime_resources))
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/metrics", get(metrics))
        .with_state(service)
}

/// create_task 处理任务提交请求 / handles task submission requests.
async fn create_task(
    State(service): State<RuntimeService>,
    Json(payload): Json<SubmitTaskRequest>,
) -> Result<impl IntoResponse, AppError> {
    let response = service.submit_task(payload).await?;
    Ok(Json(response))
}

/// get_task 返回单个任务的状态快照 / returns the status snapshot of one task.
async fn get_task(
    State(service): State<RuntimeService>,
    Path(task_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let response = service.get_task_status(&task_id).await?;
    Ok(Json(response))
}

/// kill_task 请求取消单个任务；从 x-execgo-owner 请求头读取调用者身份 / requests cancellation of a single task; reads caller identity from x-execgo-owner header.
async fn kill_task(
    State(service): State<RuntimeService>,
    Path(task_id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let caller_owner = headers
        .get("x-execgo-owner")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let response = service.kill_task(&task_id, caller_owner).await?;
    Ok(Json(response))
}

/// get_events 返回任务的持久化事件流 / returns the persisted event stream of a task.
async fn get_events(
    State(service): State<RuntimeService>,
    Path(task_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let response = service.get_events(&task_id).await?;
    Ok(Json(response))
}

/// healthz 返回轻量健康检查响应 / returns a lightweight health-check response.
async fn healthz() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// runtime_info 返回 runtime 基础信息 / returns basic runtime information.
async fn runtime_info(
    State(service): State<RuntimeService>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(service.runtime_info().await))
}

/// runtime_capabilities 返回 runtime 能力快照 / returns the runtime capability snapshot.
async fn runtime_capabilities(
    State(service): State<RuntimeService>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(service.runtime_capabilities().await))
}

/// runtime_config 返回当前 runtime 配置快照 / returns the current runtime configuration snapshot.
async fn runtime_config(
    State(service): State<RuntimeService>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(service.runtime_config().await))
}

/// runtime_resources 返回资源账本的当前视图 / returns the current view of the resource ledger.
async fn runtime_resources(
    State(service): State<RuntimeService>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(service.runtime_resources().await?))
}

/// readyz 在基础依赖可用时返回 ready / returns ready when core dependencies are available.
async fn readyz(State(service): State<RuntimeService>) -> Result<impl IntoResponse, AppError> {
    service.ready().await?;
    Ok(Json(HealthResponse {
        status: "ready",
        version: env!("CARGO_PKG_VERSION"),
    }))
}

/// metrics 返回 Prometheus 指标文本 / returns Prometheus metrics text.
async fn metrics(State(service): State<RuntimeService>) -> Result<impl IntoResponse, AppError> {
    Ok(service.metrics().await)
}
