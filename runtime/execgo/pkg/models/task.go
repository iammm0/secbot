// Package models 定义 ExecGo 的核心数据结构 / core data structures for ExecGo.
// Author: iammm0; Last edited: 2026-04-23
package models

import (
	"encoding/json"
	"fmt"
	"time"
)

// TaskStatus 任务状态枚举 / task status enum.
type TaskStatus string

// TaskStatus 常量集合 / TaskStatus values.
const (
	StatusPending    TaskStatus = "pending"
	StatusRunning    TaskStatus = "running"
	StatusCancelling TaskStatus = "cancelling"
	StatusSuccess    TaskStatus = "success"
	StatusFailed     TaskStatus = "failed"
	StatusCancelled  TaskStatus = "cancelled"
	StatusSkipped    TaskStatus = "skipped" // 依赖失败或取消时跳过 / skipped when dependency fails or is cancelled
)

// IsTerminal reports whether the task reached a final state.
func (s TaskStatus) IsTerminal() bool {
	switch s {
	case StatusSuccess, StatusFailed, StatusCancelled, StatusSkipped:
		return true
	default:
		return false
	}
}

// Task 是 AI 与执行引擎之间的核心契约 / core contract between AI and execution engine.
type Task struct {
	ID          string            `json:"id"`
	Type        string            `json:"type"`
	Params      json.RawMessage   `json:"params,omitempty"`
	ToolName    string            `json:"tool_name,omitempty"`
	Input       json.RawMessage   `json:"input,omitempty"`
	Category    string            `json:"execution_category,omitempty"` // mcp | cli-skills | os
	DependsOn   []string          `json:"depends_on,omitempty"`
	Retry       int               `json:"retry,omitempty"`
	Timeout     int64             `json:"timeout,omitempty"` // 毫秒 / milliseconds
	Annotations map[string]string `json:"annotations,omitempty"`
	Status      TaskStatus        `json:"status"`
	RunStatus   string            `json:"run_status,omitempty"` // accepted | running | cancelling | success | failed | cancelled
	HandleID    string            `json:"handle_id,omitempty"`
	Progress    json.RawMessage   `json:"progress,omitempty"`
	Result      json.RawMessage   `json:"result,omitempty"`
	Runtime     *RuntimeResult    `json:"runtime,omitempty"` // 规范化运行时结果 / normalized runtime envelope
	Events      []RuntimeEvent    `json:"events,omitempty"`
	Error       string            `json:"error,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

// TaskGraph 是一次提交的任务 DAG / a submitted task DAG.
type TaskGraph struct {
	Tasks []*Task `json:"tasks"`
}

// Validate 校验任务图的合法性 / validates the task graph.
func (g *TaskGraph) Validate() error {
	if len(g.Tasks) == 0 {
		return fmt.Errorf("task graph is empty")
	}

	ids := make(map[string]bool, len(g.Tasks))
	for _, t := range g.Tasks {
		if t.ID == "" {
			return fmt.Errorf("task id is required")
		}
		if t.Type == "" {
			return fmt.Errorf("task %q: type is required", t.ID)
		}
		if ids[t.ID] {
			return fmt.Errorf("duplicate task id: %q", t.ID)
		}
		ids[t.ID] = true
	}

	// 检查依赖引用是否合法 / verify dependency references
	for _, t := range g.Tasks {
		for _, dep := range t.DependsOn {
			if !ids[dep] {
				return fmt.Errorf("task %q depends on unknown task %q", t.ID, dep)
			}
			if dep == t.ID {
				return fmt.Errorf("task %q cannot depend on itself", t.ID)
			}
		}
	}

	// 拓扑排序检测环 / cycle detection via topological sort
	if err := detectCycle(g.Tasks); err != nil {
		return err
	}

	return nil
}

// detectCycle 使用 Kahn 算法检测 DAG 中的环 / detect cycles using Kahn's algorithm.
func detectCycle(tasks []*Task) error {
	inDegree := make(map[string]int, len(tasks))
	dependents := make(map[string][]string, len(tasks))

	for _, t := range tasks {
		if _, ok := inDegree[t.ID]; !ok {
			inDegree[t.ID] = 0
		}
		for _, dep := range t.DependsOn {
			inDegree[t.ID]++
			dependents[dep] = append(dependents[dep], t.ID)
		}
	}

	queue := make([]string, 0)
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}

	visited := 0
	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]
		visited++

		for _, child := range dependents[node] {
			inDegree[child]--
			if inDegree[child] == 0 {
				queue = append(queue, child)
			}
		}
	}

	if visited != len(tasks) {
		return fmt.Errorf("cycle detected in task graph")
	}
	return nil
}

// SubmitResponse 提交任务后的响应 / response after task submission.
type SubmitResponse struct {
	Accepted int      `json:"accepted"`
	TaskIDs  []string `json:"task_ids"`
}

// ErrorResponse 统一错误响应 / unified error response.
type ErrorResponse struct {
	Error string `json:"error"`
}

// HealthResponse 健康检查响应 / health check response.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
	Uptime  string `json:"uptime"`
}

// MetricsResponse 指标响应 / metrics response.
type MetricsResponse struct {
	TasksTotal     int64            `json:"tasks_total"`
	TasksRunning   int64            `json:"tasks_running"`
	TasksSucceeded int64            `json:"tasks_succeeded"`
	TasksFailed    int64            `json:"tasks_failed"`
	TasksCancelled int64            `json:"tasks_cancelled"`
	ByType         map[string]int64 `json:"by_type"`
}

// CancelTaskResponse is returned by POST /tasks/{id}/cancel.
type CancelTaskResponse struct {
	TaskID  string         `json:"task_id"`
	Status  TaskStatus     `json:"status"`
	Runtime *RuntimeResult `json:"runtime,omitempty"`
	Event   *RuntimeEvent  `json:"event,omitempty"`
}
