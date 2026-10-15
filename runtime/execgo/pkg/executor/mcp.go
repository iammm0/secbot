// MCP executor with async handle management / 带异步 handle 管理的 MCP 执行器。
// Author: iammm0; Last edited: 2026-04-23
package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/iammm0/execgo/pkg/models"
)

// MCPExecutor 管理异步 MCP 任务 handle 并委托扩展执行具体方法 / manages asynchronous MCP task handles and delegates method execution to an extension.
type MCPExecutor struct {
	ext     ExecutorExtension
	mu      sync.RWMutex
	handles map[string]*Result
}

// NewMCPExecutor 创建 MCP executor，并在未传扩展时使用默认回显实现 / creates an MCP executor and uses the default echo implementation when no extension is provided.
func NewMCPExecutor(ext ExecutorExtension) *MCPExecutor {
	if ext == nil {
		ext = mcpDefaultExtension{}
	}
	return &MCPExecutor{
		ext:     ext,
		handles: make(map[string]*Result),
	}
}

// Name 返回执行器注册名 / returns the executor registry name.
func (e *MCPExecutor) Name() string { return "mcp" }

// Category 返回执行器分类 / returns the executor category.
func (e *MCPExecutor) Category() string { return "mcp" }

// Execute 接收 MCP 任务并返回异步 handle，实际执行在后台完成 / accepts an MCP task and returns an asynchronous handle while execution continues in the background.
func (e *MCPExecutor) Execute(ctx context.Context, task *models.Task) (*Result, error) {
	if err := e.ext.BeforeExecute(ctx, task); err != nil {
		return nil, err
	}

	startedAt := time.Now()
	handleID := task.HandleID
	if handleID == "" {
		handleID = fmt.Sprintf("mcp-%d", time.Now().UnixNano())
	}
	initial := &Result{
		TaskID:    task.ID,
		Status:    models.RuntimeAccepted,
		HandleID:  handleID,
		StartedAt: &startedAt,
		Progress:  []ProgressEvent{{Timestamp: startedAt, Message: "task accepted"}},
	}

	e.mu.Lock()
	e.handles[handleID] = initial
	e.mu.Unlock()

	go func() {
		e.mu.Lock()
		cur := e.handles[handleID]
		if cur != nil {
			cur.Status = models.RuntimeRunning
			cur.Progress = append(cur.Progress, ProgressEvent{Timestamp: time.Now(), Message: "task started"})
		}
		e.mu.Unlock()

		out, err := e.ext.ExecuteMethod(ctx, task)
		e.mu.Lock()
		defer e.mu.Unlock()
		cur = e.handles[handleID]
		if cur == nil {
			return
		}
		finishedAt := time.Now()
		cur.FinishedAt = &finishedAt
		if cur.StartedAt != nil {
			cur.DurationMS = finishedAt.Sub(*cur.StartedAt).Milliseconds()
		}
		if err != nil {
			cur.Status = models.RuntimeFailed
			cur.Error = &models.RuntimeError{
				Code:    models.ErrorExternalFailure,
				Message: err.Error(),
				Source:  "executor",
			}
			cur.Progress = append(cur.Progress, ProgressEvent{Timestamp: time.Now(), Message: err.Error()})
			_ = e.ext.OnError(ctx, err, task)
			return
		}
		if out != nil {
			cur.Output = out.Output
			cur.Details = out.Details
			if out.Error != nil {
				cur.Error = out.Error
			}
		}
		cur.Status = models.RuntimeSuccess
		cur.Progress = append(cur.Progress, ProgressEvent{Timestamp: time.Now(), Message: "task completed"})
		_ = e.ext.AfterExecute(ctx, cur)
	}()

	return initial, nil
}

// ListTools 返回 MCP executor 暴露的工具清单 / returns the tools exposed by the MCP executor.
func (e *MCPExecutor) ListTools(ctx context.Context) ([]Tool, error) {
	_ = ctx
	return []Tool{
		{
			Name:        "mcp.execute",
			Category:    "mcp",
			Description: "Execute MCP task and return handle",
			InputSchema: map[string]any{"type": "object"},
		},
	}, nil
}

// HealthCheck 检查 MCP executor 是否可用 / checks whether the MCP executor is available.
func (e *MCPExecutor) HealthCheck() error { return nil }

// Shutdown 关闭 MCP executor 并释放资源 / shuts down the MCP executor and releases resources.
func (e *MCPExecutor) Shutdown(ctx context.Context) error {
	_ = ctx
	return nil
}

// GetHandle 返回指定 handle 的任务结果副本 / returns a copy of the task result for the given handle.
func (e *MCPExecutor) GetHandle(handleID string) (*Result, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	r, ok := e.handles[handleID]
	if !ok {
		return nil, false
	}
	cp := *r
	if len(r.Output) > 0 {
		cp.Output = append(json.RawMessage{}, r.Output...)
	}
	if len(r.Details) > 0 {
		cp.Details = append(json.RawMessage{}, r.Details...)
	}
	if r.StartedAt != nil {
		startedAt := *r.StartedAt
		cp.StartedAt = &startedAt
	}
	if r.FinishedAt != nil {
		finishedAt := *r.FinishedAt
		cp.FinishedAt = &finishedAt
	}
	if r.Error != nil {
		errCopy := *r.Error
		cp.Error = &errCopy
	}
	return &cp, true
}

// mcpDefaultExtension 是没有外部 MCP 实现时使用的默认回显扩展 / is the default echo extension used when no external MCP implementation is provided.
type mcpDefaultExtension struct{ NopExtension }

// ExecuteMethod 回显 MCP 任务输入，便于本地 smoke 测试 / echoes MCP task input for local smoke testing.
func (mcpDefaultExtension) ExecuteMethod(ctx context.Context, task *models.Task) (*Result, error) {
	_ = ctx
	payload := task.Input
	if len(payload) == 0 {
		payload = task.Params
	}
	return &Result{
		TaskID: task.ID,
		Status: models.RuntimeSuccess,
		Output: mustJSONMarshal(map[string]any{
			"tool_name": task.ToolName,
			"echo":      json.RawMessage(payload),
		}),
	}, nil
}
