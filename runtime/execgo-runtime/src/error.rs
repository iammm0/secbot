//! 统一错误类型、HTTP 映射与错误信封 / Unified error types, HTTP mapping, and error envelopes.
// Author: iammm0; Last edited: 2026-04-23

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use serde_json::json;
use thiserror::Error;

use crate::types::{ErrorCode, RuntimeErrorInfo};

/// AppResult 是 runtime 内部统一使用的错误返回类型 / is the unified result type used across the runtime.
pub type AppResult<T> = Result<T, AppError>;

/// AppError 定义 runtime 内部和 HTTP API 共享的错误枚举 / defines the error enum shared by runtime internals and the HTTP API.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("task not found: {0}")]
    NotFound(String),
    #[error("queue is full")]
    QueueFull,
    #[error("task is already terminal: {0}")]
    Conflict(String),
    #[error("launch failed: {0}")]
    LaunchFailed(String),
    #[error("sandbox setup failed: {0}")]
    SandboxSetup(String),
    #[error("unsupported capability: {0}")]
    UnsupportedCapability(String),
    #[error("insufficient resources: {0}")]
    InsufficientResources(String),
    #[error("permission denied: {0}")]
    PermissionDenied(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("internal error: {0}")]
    Internal(String),
}

impl AppError {
    /// code 将内部错误映射为稳定的 runtime 错误码 / maps an internal error into a stable runtime error code.
    pub fn code(&self) -> ErrorCode {
        match self {
            AppError::InvalidInput(_) => ErrorCode::InvalidInput,
            AppError::NotFound(_) => ErrorCode::NotFound,
            AppError::QueueFull => ErrorCode::ResourceLimitExceeded,
            AppError::Conflict(_) => ErrorCode::Conflict,
            AppError::LaunchFailed(_) => ErrorCode::LaunchFailed,
            AppError::SandboxSetup(_) => ErrorCode::SandboxSetupFailed,
            AppError::UnsupportedCapability(_) => ErrorCode::UnsupportedCapability,
            AppError::InsufficientResources(_) => ErrorCode::InsufficientResources,
            AppError::PermissionDenied(_) => ErrorCode::PermissionDenied,
            AppError::Io(_) | AppError::Sqlite(_) | AppError::Json(_) | AppError::Http(_) => {
                ErrorCode::Internal
            }
            AppError::Internal(_) => ErrorCode::Internal,
        }
    }

    /// status_code 将内部错误映射为 HTTP 状态码 / maps an internal error into an HTTP status code.
    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::InvalidInput(_) => StatusCode::BAD_REQUEST,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::QueueFull => StatusCode::TOO_MANY_REQUESTS,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::LaunchFailed(_)
            | AppError::SandboxSetup(_)
            | AppError::UnsupportedCapability(_)
            | AppError::InsufficientResources(_) => StatusCode::BAD_REQUEST,
            AppError::PermissionDenied(_) => StatusCode::FORBIDDEN,
            AppError::Io(_)
            | AppError::Sqlite(_)
            | AppError::Json(_)
            | AppError::Http(_)
            | AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// as_runtime_error 将内部错误包装为对外暴露的标准错误信封 / wraps the internal error into the normalized public runtime error envelope.
    pub fn as_runtime_error(&self) -> RuntimeErrorInfo {
        RuntimeErrorInfo {
            code: self.code(),
            message: self.to_string(),
            details: None,
        }
    }
}

/// ErrorEnvelope 是 HTTP 错误响应使用的 JSON 信封 / is the JSON envelope used for HTTP error responses.
#[derive(Debug, Serialize)]
struct ErrorEnvelope {
    error: RuntimeErrorInfo,
}

impl IntoResponse for AppError {
    /// into_response 将 AppError 序列化为 axum 响应 / serializes AppError into an axum response.
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = Json(ErrorEnvelope {
            error: self.as_runtime_error(),
        });
        (status, body).into_response()
    }
}

/// json_error 构造轻量 JSON 错误对象，便于测试和辅助输出 / builds a lightweight JSON error object for tests and helper output.
pub fn json_error(code: ErrorCode, message: impl Into<String>) -> serde_json::Value {
    json!({
        "error": {
            "code": code,
            "message": message.into(),
        }
    })
}
