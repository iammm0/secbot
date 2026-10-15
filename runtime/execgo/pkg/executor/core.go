// Package executor 定义执行器接口和全局注册表
// defines the Executor interface and global registry.
// Author: iammm0; Last edited: 2026-04-23
package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/iammm0/execgo/pkg/models"
)

// Executor 是所有执行器必须实现的接口 / interface that all executors must implement.
type Executor interface {
	// Name 返回执行器名称（用于注册表）/ returns executor registry name.
	Name() string
	// Category 返回执行器分类 / returns executor category.
	Category() string
	// Execute 执行任务并返回结果 / executes a task and returns the result.
	Execute(ctx context.Context, task *models.Task) (*Result, error)
	// ListTools 返回可发现工具 / returns discoverable tools.
	ListTools(ctx context.Context) ([]Tool, error)
	// HealthCheck 检查执行器状态 / checks executor health.
	HealthCheck() error
	// Shutdown 释放资源 / releases executor resources.
	Shutdown(ctx context.Context) error
}

// HandleReader 是可选能力：支持异步 handle，并允许轮询任务终态 / optional capability: exposes async handles and allows polling terminal state.
type HandleReader interface {
	GetHandle(handleID string) (*Result, bool)
}

// HandleCanceler 是可选能力：支持按 handle 取消异步任务 / optional capability: cancels async tasks by handle identifier.
type HandleCanceler interface {
	CancelHandle(handleID string) (*Result, bool)
}

// EventReader 是可选能力：支持按 handle 获取运行时事件历史 / optional capability: exposes runtime event history for a handle.
type EventReader interface {
	GetEvents(handleID string) ([]models.RuntimeEvent, bool)
}

// RuntimeIntrospector 是可选能力：暴露 runtime 级元信息（capabilities/resources/config 等）/ optional capability: exposes runtime-level metadata.
type RuntimeIntrospector interface {
	GetRuntimeInfo(ctx context.Context) (json.RawMessage, error)
	GetRuntimeCapabilities(ctx context.Context) (json.RawMessage, error)
	GetRuntimeResources(ctx context.Context) (json.RawMessage, error)
	GetRuntimeConfig(ctx context.Context) (json.RawMessage, error)
}

// Tool 描述可发现的工具元信息 / describes discoverable tool metadata.
type Tool struct {
	Name        string            `json:"name"`
	Category    string            `json:"category"`
	Description string            `json:"description,omitempty"`
	InputSchema map[string]any    `json:"input_schema,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

// ProgressEvent 描述运行过程中的进度事件 / describes a progress event during execution.
type ProgressEvent struct {
	Timestamp time.Time      `json:"timestamp"`
	Message   string         `json:"message,omitempty"`
	Data      map[string]any `json:"data,omitempty"`
}

// Result 是 Executor 的标准输出结构 / is the normalized output of an Executor.
type Result struct {
	TaskID     string               `json:"task_id,omitempty"`
	Status     models.RuntimeStatus `json:"status"`
	HandleID   string               `json:"handle_id,omitempty"`
	Output     json.RawMessage      `json:"output,omitempty"`
	Details    json.RawMessage      `json:"details,omitempty"`
	Progress   []ProgressEvent      `json:"progress,omitempty"`
	StartedAt  *time.Time           `json:"started_at,omitempty"`
	FinishedAt *time.Time           `json:"finished_at,omitempty"`
	DurationMS int64                `json:"duration_ms,omitempty"`
	Attempt    int                  `json:"attempt,omitempty"`
	Error      *models.RuntimeError `json:"error,omitempty"`
}

// ----------------------------------------------------------------
// Registry 全局执行器注册表 / global executor registry
// ----------------------------------------------------------------

var (
	registryMu sync.RWMutex
	registry   = make(map[string]Executor)
)

// Register 注册一个执行器 / registers an executor.
func Register(e Executor) {
	registryMu.Lock()
	defer registryMu.Unlock()
	registry[e.Name()] = e
}

// Get 按类型获取执行器 / retrieves an executor by type.
func Get(taskType string) (Executor, error) {
	registryMu.RLock()
	defer registryMu.RUnlock()

	e, ok := registry[taskType]
	if !ok {
		return nil, fmt.Errorf("no executor registered for type %q", taskType)
	}
	return e, nil
}

// GetByCategory 获取一个分类下的执行器 / retrieves executors by category.
func GetByCategory(category string) ([]Executor, error) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	out := make([]Executor, 0)
	for _, e := range registry {
		if e.Category() == category {
			out = append(out, e)
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no executor registered for category %q", category)
	}
	return out, nil
}

// RegisteredTypes 返回所有已注册的类型 / returns all registered types.
func RegisteredTypes() []string {
	registryMu.RLock()
	defer registryMu.RUnlock()

	types := make([]string, 0, len(registry))
	for k := range registry {
		types = append(types, k)
	}
	sort.Strings(types)
	return types
}

// RegisterBuiltins 注册所有内置执行器 / registers all built-in executors.
func RegisterBuiltins() {
	Register(NewOSExecutor())
	Register(NewMCPExecutor(nil))
	Register(NewCLISkillsExecutor(nil))
	Register(NewRuntimeExecutorFromEnv())
}

func mustJSONMarshal(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
