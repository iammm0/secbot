// Package models 定义 ExecGo 的核心数据结构 / core data structures for ExecGo.
// Author: iammm0; Last edited: 2026-04-23
package models

import "time"

// RuntimeStatus 描述单次可执行任务运行的生命周期 / describes the lifecycle of an executable task run.
// 它比 TaskStatus 更细粒度，面向 agent runtime 语义 / it is finer-grained than TaskStatus for agent runtime semantics.
type RuntimeStatus string

// RuntimeStatus 常量集合 / RuntimeStatus values.
const (
	RuntimeAccepted   RuntimeStatus = "accepted"
	RuntimeRunning    RuntimeStatus = "running"
	RuntimeCancelling RuntimeStatus = "cancelling"
	RuntimeSuccess    RuntimeStatus = "success"
	RuntimeFailed     RuntimeStatus = "failed"
	RuntimeCancelled  RuntimeStatus = "cancelled"
)

// IsTerminal 判断 runtime 状态是否已经结束 / reports whether the runtime state is terminal.
func (s RuntimeStatus) IsTerminal() bool {
	switch s {
	case RuntimeSuccess, RuntimeFailed, RuntimeCancelled:
		return true
	default:
		return false
	}
}

// ErrorCode 标识稳定、机器可读的失败分类 / identifies a stable machine-readable failure category.
type ErrorCode string

// ErrorCode 常量集合 / ErrorCode values.
const (
	ErrorUnknown         ErrorCode = "unknown"
	ErrorInvalidInput    ErrorCode = "invalid_input"
	ErrorLaunchFailed    ErrorCode = "launch_failed"
	ErrorTimeout         ErrorCode = "timeout"
	ErrorCancelled       ErrorCode = "cancelled"
	ErrorMemoryLimit     ErrorCode = "memory_limit_exceeded"
	ErrorCPULimit        ErrorCode = "cpu_limit_exceeded"
	ErrorResourceLimit   ErrorCode = "resource_limit_exceeded"
	ErrorSandboxSetup    ErrorCode = "sandbox_setup_failed"
	ErrorExitNonZero     ErrorCode = "exit_nonzero"
	ErrorDenied          ErrorCode = "denied"
	ErrorNotFound        ErrorCode = "not_found"
	ErrorExternalFailure ErrorCode = "external_failure"
	ErrorInternal        ErrorCode = "internal"
)

// RuntimeError 是 executor 和 API 返回的标准失败信封 / is the normalized failure envelope returned by executors and APIs.
type RuntimeError struct {
	Code      ErrorCode `json:"code"`
	Message   string    `json:"message"`
	Retryable bool      `json:"retryable,omitempty"`
	Source    string    `json:"source,omitempty"`
	Details   any       `json:"details,omitempty"`
}

// RuntimeResult 是任务运行结果的标准输出信封 / is the normalized task run output envelope.
// executor 专属负载应放在 Output 或 Details 中 / executor-specific payloads should live under Output or Details.
type RuntimeResult struct {
	Status     RuntimeStatus `json:"status"`
	HandleID   string        `json:"handle_id,omitempty"`
	Output     any           `json:"output,omitempty"`
	StartedAt  *time.Time    `json:"started_at,omitempty"`
	FinishedAt *time.Time    `json:"finished_at,omitempty"`
	DurationMS int64         `json:"duration_ms,omitempty"`
	Attempt    int           `json:"attempt,omitempty"`
	Details    any           `json:"details,omitempty"`
	Error      *RuntimeError `json:"error,omitempty"`
}

// RuntimeEventType 定义 runtime 发出的结构化生命周期事件 / defines structured lifecycle events emitted by the runtime.
type RuntimeEventType string

// RuntimeEventType 常量集合 / RuntimeEventType values.
const (
	RuntimeEventSubmitted       RuntimeEventType = "task_submitted"
	RuntimeEventAccepted        RuntimeEventType = "task_accepted"
	RuntimeEventStarted         RuntimeEventType = "task_started"
	RuntimeEventProgress        RuntimeEventType = "task_progressed"
	RuntimeEventRetried         RuntimeEventType = "task_retried"
	RuntimeEventCancelRequested RuntimeEventType = "task_cancel_requested"
	RuntimeEventSucceeded       RuntimeEventType = "task_succeeded"
	RuntimeEventFailed          RuntimeEventType = "task_failed"
	RuntimeEventCancelled       RuntimeEventType = "task_cancelled"
)

// RuntimeEvent 是执行生命周期流式输出或审计使用的标准事件模型 / is the normalized event model for execution lifecycle streaming or audit.
type RuntimeEvent struct {
	Type      RuntimeEventType `json:"type"`
	TaskID    string           `json:"task_id"`
	HandleID  string           `json:"handle_id,omitempty"`
	Timestamp time.Time        `json:"timestamp"`
	Message   string           `json:"message,omitempty"`
	Data      any              `json:"data,omitempty"`
}
