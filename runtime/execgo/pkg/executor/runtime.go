// Runtime executor over execgo-runtime HTTP API / 基于 execgo-runtime HTTP API 的执行器。
// Author: iammm0; Last edited: 2026-04-23
package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/iammm0/execgo/pkg/models"
)

const (
	// RuntimeBaseURLEnv 指定 execgo-runtime 基础地址环境变量 / names the environment variable for the execgo-runtime base URL.
	RuntimeBaseURLEnv = "EXECGO_RUNTIME_URL"
	// DefaultRuntimeBaseURL 是本地 runtime 的默认地址 / is the default local runtime address.
	DefaultRuntimeBaseURL = "http://127.0.0.1:8080"
	// RuntimeTenantEnv 指定租户标识环境变量 / names the environment variable for the tenant identifier.
	RuntimeTenantEnv = "EXECGO_RUNTIME_TENANT"
	// RuntimeOwnerEnv 指定所有者标识环境变量 / names the environment variable for the owner identifier.
	RuntimeOwnerEnv = "EXECGO_RUNTIME_OWNER"
)

// RuntimeExecutor 通过 execgo-runtime HTTP API 提交、轮询和取消任务 / submits, polls, and cancels tasks through the execgo-runtime HTTP API.
type RuntimeExecutor struct {
	baseURL string
	client  *http.Client
	tenant  string
	owner   string

	mu           sync.RWMutex
	handleToTask map[string]string
}

type runtimeSubmitResponse struct {
	TaskID   string               `json:"task_id"`
	HandleID string               `json:"handle_id"`
	Status   models.RuntimeStatus `json:"status"`
}

type runtimeTaskResponse struct {
	TaskID     string               `json:"task_id"`
	HandleID   string               `json:"handle_id"`
	Status     models.RuntimeStatus `json:"status"`
	StartedAt  *time.Time           `json:"started_at,omitempty"`
	FinishedAt *time.Time           `json:"finished_at,omitempty"`
	DurationMS int64                `json:"duration_ms,omitempty"`
	Error      *runtimeAPIError     `json:"error,omitempty"`
}

type runtimeAPIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

type runtimeErrorEnvelope struct {
	Error *runtimeAPIError `json:"error,omitempty"`
}

type runtimeEventsEnvelope struct {
	Events []models.RuntimeEvent `json:"events"`
}

// NewRuntimeExecutor 创建 runtime executor 并规范化基础地址与 HTTP client / creates a runtime executor and normalizes the base URL and HTTP client.
// tenant 和 owner 可以为空字符串；非空时会被注入提交 payload 的 control_context 中 / may be empty; when non-empty they are injected into the submit payload's control_context.
func NewRuntimeExecutor(baseURL string, client *http.Client, tenant, owner string) *RuntimeExecutor {
	baseURL = strings.TrimSpace(strings.TrimRight(baseURL, "/"))
	if baseURL == "" {
		baseURL = DefaultRuntimeBaseURL
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &RuntimeExecutor{
		baseURL:      baseURL,
		client:       client,
		tenant:       strings.TrimSpace(tenant),
		owner:        strings.TrimSpace(owner),
		handleToTask: make(map[string]string),
	}
}

// NewRuntimeExecutorFromEnv 从环境变量创建 runtime executor / creates a runtime executor from environment variables.
func NewRuntimeExecutorFromEnv() *RuntimeExecutor {
	return NewRuntimeExecutor(
		os.Getenv(RuntimeBaseURLEnv),
		nil,
		os.Getenv(RuntimeTenantEnv),
		os.Getenv(RuntimeOwnerEnv),
	)
}

// Name 返回执行器注册名 / returns the executor registry name.
func (e *RuntimeExecutor) Name() string { return "runtime" }

// Category 返回执行器分类 / returns the executor category.
func (e *RuntimeExecutor) Category() string { return "runtime" }

// Execute 将 ExecGo 任务提交给外部 runtime，并返回可轮询的 handle / submits an ExecGo task to the external runtime and returns a pollable handle.
func (e *RuntimeExecutor) Execute(ctx context.Context, task *models.Task) (*Result, error) {
	payload, err := e.runtimePayload(task)
	if err != nil {
		return &Result{
			TaskID: task.ID,
			Status: models.RuntimeFailed,
			Error: &models.RuntimeError{
				Code:      models.ErrorInvalidInput,
				Message:   err.Error(),
				Retryable: false,
				Source:    "runtime-executor",
			},
		}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.baseURL+"/api/v1/tasks", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create runtime submit request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return &Result{
			TaskID: task.ID,
			Status: models.RuntimeFailed,
			Error: &models.RuntimeError{
				Code:      models.ErrorExternalFailure,
				Message:   err.Error(),
				Retryable: true,
				Source:    "runtime-executor",
			},
		}, fmt.Errorf("runtime submit request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read runtime submit response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rerr := decodeRuntimeAPIError(body)
		if rerr == nil {
			rerr = &models.RuntimeError{
				Code:      models.ErrorExternalFailure,
				Message:   fmt.Sprintf("runtime submit returned status %d", resp.StatusCode),
				Retryable: resp.StatusCode >= 500,
				Source:    "execgo-runtime",
			}
		}
		return &Result{
			TaskID: task.ID,
			Status: models.RuntimeFailed,
			Error:  rerr,
			Output: cloneJSON(body),
		}, errors.New(rerr.Message)
	}

	var accepted runtimeSubmitResponse
	if err := json.Unmarshal(body, &accepted); err != nil {
		return nil, fmt.Errorf("decode runtime submit response: %w", err)
	}
	e.rememberRuntimeMapping(accepted.HandleID, accepted.TaskID)

	handleID := strings.TrimSpace(accepted.HandleID)
	taskID := strings.TrimSpace(accepted.TaskID)
	if handleID == "" {
		handleID = taskID
	}
	return &Result{
		TaskID:   taskID,
		HandleID: handleID,
		Status:   accepted.Status,
		Output:   cloneJSON(body),
	}, nil
}

// GetHandle 按 handle 查询 runtime 任务结果 / queries a runtime task result by handle.
func (e *RuntimeExecutor) GetHandle(handleID string) (*Result, bool) {
	handleID = strings.TrimSpace(handleID)
	if handleID == "" {
		return nil, false
	}
	res, ok := e.getHandleByRef(handleID)
	if ok {
		return res, true
	}

	// 向后兼容：部分 runtime 可能按 task_id 暴露轮询端点 / Backward compatibility: some runtimes may expose polling endpoints keyed by task_id.
	// 即使提交响应返回了不同的 handle_id，也尝试用 task_id 查询 / even if the submit response returns a different handle_id.
	if taskID, ok := e.lookupTaskID(handleID); ok && taskID != "" && taskID != handleID {
		return e.getHandleByRef(taskID)
	}
	return nil, false
}

// CancelHandle 按 handle 取消 runtime 任务 / cancels a runtime task by handle.
func (e *RuntimeExecutor) CancelHandle(handleID string) (*Result, bool) {
	handleID = strings.TrimSpace(handleID)
	if handleID == "" {
		return nil, false
	}
	res, ok := e.cancelByRef(handleID)
	if ok {
		return res, true
	}
	if taskID, ok := e.lookupTaskID(handleID); ok && taskID != "" && taskID != handleID {
		return e.cancelByRef(taskID)
	}
	return nil, false
}

// GetEvents 按 handle 查询 runtime 事件流 / queries runtime events by handle.
func (e *RuntimeExecutor) GetEvents(handleID string) ([]models.RuntimeEvent, bool) {
	handleID = strings.TrimSpace(handleID)
	if handleID == "" {
		return nil, false
	}
	evs, ok := e.getEventsByRef(handleID)
	if ok {
		return evs, true
	}
	if taskID, ok := e.lookupTaskID(handleID); ok && taskID != "" && taskID != handleID {
		return e.getEventsByRef(taskID)
	}
	return nil, false
}

func (e *RuntimeExecutor) getHandleByRef(ref string) (*Result, bool) {
	req, err := http.NewRequest(http.MethodGet, e.baseURL+"/api/v1/tasks/"+ref, nil)
	if err != nil {
		return nil, false
	}
	resp, err := e.client.Do(req)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, false
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, false
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rerr := decodeRuntimeAPIError(body)
		res := &Result{
			TaskID:   ref,
			HandleID: ref,
			Status:   models.RuntimeFailed,
			Output:   cloneJSON(body),
		}
		if rerr != nil {
			res.Error = rerr
		}
		return res, true
	}

	var task runtimeTaskResponse
	if err := json.Unmarshal(body, &task); err != nil {
		return nil, false
	}
	e.rememberRuntimeMapping(task.HandleID, task.TaskID)

	outHandle := strings.TrimSpace(task.HandleID)
	if outHandle == "" {
		outHandle = ref
	}
	res := &Result{
		TaskID:     task.TaskID,
		HandleID:   outHandle,
		Status:     task.Status,
		StartedAt:  task.StartedAt,
		FinishedAt: task.FinishedAt,
		DurationMS: task.DurationMS,
		Output:     cloneJSON(body),
	}
	if task.Error != nil {
		res.Error = convertRuntimeAPIError(task.Error)
	}
	return res, true
}

func (e *RuntimeExecutor) getEventsByRef(ref string) ([]models.RuntimeEvent, bool) {
	req, err := http.NewRequest(http.MethodGet, e.baseURL+"/api/v1/tasks/"+ref+"/events", nil)
	if err != nil {
		return nil, false
	}
	resp, err := e.client.Do(req)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, false
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, false
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// GetEvents 目前只暴露 bool；调用方需要结构化错误时可重新拉取任务状态 / GetEvents currently exposes only a bool; callers can re-fetch task status for structured errors.
		return nil, true
	}

	// 兼容直接数组和信封对象两种响应：`[ {...}, ... ]` 与 `{ "events": [ ... ] }` / tolerates both direct arrays and envelope objects.
	var direct []models.RuntimeEvent
	if err := json.Unmarshal(body, &direct); err == nil {
		return direct, true
	}
	var env runtimeEventsEnvelope
	if err := json.Unmarshal(body, &env); err == nil && env.Events != nil {
		return env.Events, true
	}
	return nil, true
}

func (e *RuntimeExecutor) cancelByRef(ref string) (*Result, bool) {
	req, err := http.NewRequest(http.MethodPost, e.baseURL+"/api/v1/tasks/"+ref+"/kill", nil)
	if err != nil {
		return nil, false
	}
	// owner が設定されている場合はヘッダを付与 / inject X-Execgo-Owner when owner is configured.
	if e.owner != "" {
		req.Header.Set("X-Execgo-Owner", e.owner)
	}
	resp, err := e.client.Do(req)
	if err != nil {
		return &Result{
			TaskID:   ref,
			HandleID: ref,
			Status:   models.RuntimeFailed,
			Error: &models.RuntimeError{
				Code:      models.ErrorExternalFailure,
				Message:   err.Error(),
				Retryable: true,
				Source:    "runtime-executor",
			},
		}, true
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, false
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, false
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rerr := decodeRuntimeAPIError(body)
		if rerr == nil {
			rerr = &models.RuntimeError{
				Code:      models.ErrorExternalFailure,
				Message:   fmt.Sprintf("runtime kill returned status %d", resp.StatusCode),
				Retryable: resp.StatusCode >= 500,
				Source:    "execgo-runtime",
			}
		}
		return &Result{
			TaskID:   ref,
			HandleID: ref,
			Status:   models.RuntimeFailed,
			Error:    rerr,
			Output:   cloneJSON(body),
		}, true
	}

	// execgo-runtime 预期返回类似任务的对象，但这里兼容空响应体 / execgo-runtime is expected to return a task-like object, but empty bodies are tolerated.
	if len(body) == 0 {
		return &Result{
			TaskID:   ref,
			HandleID: ref,
			Status:   models.RuntimeCancelled,
		}, true
	}
	var task runtimeTaskResponse
	if err := json.Unmarshal(body, &task); err == nil && task.Status != "" {
		e.rememberRuntimeMapping(task.HandleID, task.TaskID)
		outHandle := strings.TrimSpace(task.HandleID)
		if outHandle == "" {
			outHandle = ref
		}
		res := &Result{
			TaskID:     task.TaskID,
			HandleID:   outHandle,
			Status:     task.Status,
			StartedAt:  task.StartedAt,
			FinishedAt: task.FinishedAt,
			DurationMS: task.DurationMS,
			Output:     cloneJSON(body),
		}
		if task.Error != nil {
			res.Error = convertRuntimeAPIError(task.Error)
		}
		return res, true
	}

	// 兜底：runtime 返回 2xx 但响应体未知时视为已取消 / fallback: treats unknown 2xx bodies as cancelled.
	return &Result{
		TaskID:   ref,
		HandleID: ref,
		Status:   models.RuntimeCancelled,
		Output:   cloneJSON(body),
	}, true
}

// ListTools 返回 runtime executor 暴露的工具清单 / returns the tools exposed by the runtime executor.
func (e *RuntimeExecutor) ListTools(ctx context.Context) ([]Tool, error) {
	_ = ctx
	return []Tool{
		{
			Name:        "runtime.execute",
			Category:    "runtime",
			Description: "Submit task to execgo-runtime and poll/cancel by handle",
			InputSchema: map[string]any{"type": "object"},
		},
	}, nil
}

// GetRuntimeInfo 拉取 runtime 基础信息 / fetches runtime basic information.
func (e *RuntimeExecutor) GetRuntimeInfo(ctx context.Context) (json.RawMessage, error) {
	return e.getRuntimeJSON(ctx, "/api/v1/runtime/info")
}

// GetRuntimeCapabilities 拉取 runtime 能力快照 / fetches the runtime capability snapshot.
func (e *RuntimeExecutor) GetRuntimeCapabilities(ctx context.Context) (json.RawMessage, error) {
	return e.getRuntimeJSON(ctx, "/api/v1/runtime/capabilities")
}

// GetRuntimeResources 拉取 runtime 资源状态 / fetches runtime resource status.
func (e *RuntimeExecutor) GetRuntimeResources(ctx context.Context) (json.RawMessage, error) {
	return e.getRuntimeJSON(ctx, "/api/v1/runtime/resources")
}

// GetRuntimeConfig 拉取 runtime 配置快照 / fetches the runtime configuration snapshot.
func (e *RuntimeExecutor) GetRuntimeConfig(ctx context.Context) (json.RawMessage, error) {
	return e.getRuntimeJSON(ctx, "/api/v1/runtime/config")
}

// HealthCheck 检查 runtime 是否 ready / checks whether the runtime is ready.
func (e *RuntimeExecutor) HealthCheck() error {
	req, err := http.NewRequest(http.MethodGet, e.baseURL+"/readyz", nil)
	if err != nil {
		return err
	}
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("runtime readiness returned status %d", resp.StatusCode)
	}
	return nil
}

// Shutdown 释放 runtime executor 资源 / releases runtime executor resources.
func (e *RuntimeExecutor) Shutdown(ctx context.Context) error {
	_ = ctx
	return nil
}

func (e *RuntimeExecutor) getRuntimeJSON(ctx context.Context, path string) (json.RawMessage, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, fmt.Errorf("runtime path is empty")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, e.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := e.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rerr := decodeRuntimeAPIError(body)
		if rerr == nil {
			rerr = &models.RuntimeError{
				Code:      models.ErrorExternalFailure,
				Message:   fmt.Sprintf("runtime endpoint %s returned status %d", path, resp.StatusCode),
				Retryable: resp.StatusCode >= 500,
				Source:    "execgo-runtime",
				Details: map[string]any{
					"path": path,
				},
			}
		}
		return nil, errors.New(rerr.Message)
	}
	return cloneJSON(body), nil
}

// runtimePayload 将任务输入序列化为提交 payload，并将 tenant/owner 合并到 control_context（不覆盖任务已有的值）/
// serializes task input into the submit payload, merging tenant/owner into control_context without overwriting task-supplied values.
func (e *RuntimeExecutor) runtimePayload(task *models.Task) ([]byte, error) {
	raw := task.Input
	if len(raw) == 0 {
		raw = task.Params
	}
	var payload map[string]any
	if len(raw) == 0 {
		payload = make(map[string]any)
	} else if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("parse runtime input: %w", err)
	}
	if strings.TrimSpace(task.ID) != "" {
		if _, ok := payload["task_id"]; !ok {
			payload["task_id"] = task.ID
		}
	}
	// 将 tenant/owner 合并到 control_context，仅填充缺失字段 / merge tenant/owner into control_context, only filling missing fields.
	if e.tenant != "" || e.owner != "" {
		var cc map[string]any
		if existing, ok := payload["control_context"]; ok {
			if m, ok := existing.(map[string]any); ok {
				cc = m
			}
		}
		if cc == nil {
			cc = make(map[string]any)
		}
		if e.tenant != "" {
			if _, ok := cc["tenant"]; !ok {
				cc["tenant"] = e.tenant
			}
		}
		if e.owner != "" {
			if _, ok := cc["owner"]; !ok {
				cc["owner"] = e.owner
			}
		}
		payload["control_context"] = cc
	}
	return json.Marshal(payload)
}

func (e *RuntimeExecutor) rememberRuntimeMapping(handleID, taskID string) {
	handleID = strings.TrimSpace(handleID)
	taskID = strings.TrimSpace(taskID)
	if handleID == "" || taskID == "" || handleID == taskID {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.handleToTask == nil {
		e.handleToTask = make(map[string]string)
	}
	e.handleToTask[handleID] = taskID
}

func (e *RuntimeExecutor) lookupTaskID(handleID string) (string, bool) {
	handleID = strings.TrimSpace(handleID)
	if handleID == "" {
		return "", false
	}
	e.mu.RLock()
	defer e.mu.RUnlock()
	if e.handleToTask == nil {
		return "", false
	}
	taskID, ok := e.handleToTask[handleID]
	return taskID, ok
}

func decodeRuntimeAPIError(body []byte) *models.RuntimeError {
	var env runtimeErrorEnvelope
	if err := json.Unmarshal(body, &env); err == nil && env.Error != nil {
		return convertRuntimeAPIError(env.Error)
	}
	// 兼容没有信封包装的直接错误对象 / tolerates direct error objects without an envelope.
	var direct runtimeAPIError
	if err := json.Unmarshal(body, &direct); err == nil && (direct.Code != "" || direct.Message != "") {
		return convertRuntimeAPIError(&direct)
	}
	// 兼容字符串形式的错误响应体 / tolerates string error bodies.
	var msg string
	if err := json.Unmarshal(body, &msg); err == nil && strings.TrimSpace(msg) != "" {
		return &models.RuntimeError{
			Code:      models.ErrorExternalFailure,
			Message:   msg,
			Retryable: true,
			Source:    "execgo-runtime",
		}
	}
	return nil
}

func convertRuntimeAPIError(in *runtimeAPIError) *models.RuntimeError {
	if in == nil {
		return nil
	}
	return &models.RuntimeError{
		Code:      mapRuntimeErrorCode(in.Code),
		Message:   in.Message,
		Retryable: isRetryableRuntimeCode(in.Code),
		Source:    "execgo-runtime",
		Details: map[string]any{
			"raw_error_code": in.Code,
			"details":        in.Details,
		},
	}
}

func mapRuntimeErrorCode(code string) models.ErrorCode {
	switch strings.TrimSpace(code) {
	case string(models.ErrorInvalidInput):
		return models.ErrorInvalidInput
	case string(models.ErrorLaunchFailed):
		return models.ErrorLaunchFailed
	case string(models.ErrorTimeout):
		return models.ErrorTimeout
	case string(models.ErrorCancelled):
		return models.ErrorCancelled
	case string(models.ErrorMemoryLimit):
		return models.ErrorMemoryLimit
	case string(models.ErrorCPULimit):
		return models.ErrorCPULimit
	case string(models.ErrorResourceLimit):
		return models.ErrorResourceLimit
	case string(models.ErrorSandboxSetup):
		return models.ErrorSandboxSetup
	case string(models.ErrorExitNonZero):
		return models.ErrorExitNonZero
	case string(models.ErrorDenied):
		return models.ErrorDenied
	case string(models.ErrorNotFound):
		return models.ErrorNotFound
	case string(models.ErrorInternal):
		return models.ErrorInternal
	default:
		return models.ErrorExternalFailure
	}
}

func isRetryableRuntimeCode(code string) bool {
	switch strings.TrimSpace(code) {
	case string(models.ErrorTimeout), string(models.ErrorExternalFailure), string(models.ErrorResourceLimit):
		return true
	default:
		return false
	}
}

func cloneJSON(body []byte) json.RawMessage {
	if len(body) == 0 {
		return nil
	}
	cp := make([]byte, len(body))
	copy(cp, body)
	return cp
}
