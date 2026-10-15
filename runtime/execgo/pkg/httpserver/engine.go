// Package httpserver 提供可组合中间件的 HTTP API（类似 Gin 的 Use 链）/ HTTP API with composable middleware.
// Author: iammm0; Last edited: 2026-04-23
package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/iammm0/execgo/pkg/adapter"
	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/pkg/observability"
	"github.com/iammm0/execgo/pkg/scheduler"
	"github.com/iammm0/execgo/pkg/store"
	execgoversion "github.com/iammm0/execgo/pkg/version"
)

// Middleware HTTP 中间件类型 / HTTP middleware signature.
type Middleware func(http.Handler) http.Handler

// Engine HTTP 引擎：路由 + 中间件链 / HTTP engine: routes + middleware chain.
type Engine struct {
	state     store.Store
	scheduler *scheduler.Scheduler
	metrics   *observability.Metrics
	logger    *slog.Logger
	adapter   *adapter.AdapterKernel
	startTime time.Time
	mw        []Middleware
	trace     bool
}

// NewEngine 创建引擎；默认启用 Trace 中间件 / creates engine with trace middleware enabled by default.
func NewEngine(st store.Store, sched *scheduler.Scheduler, metrics *observability.Metrics, logger *slog.Logger) *Engine {
	return &Engine{
		state:     st,
		scheduler: sched,
		metrics:   metrics,
		logger:    logger,
		adapter:   adapter.NewAdapterKernel(),
		startTime: time.Now(),
		trace:     true,
	}
}

// Use 追加中间件（先注册者更靠近客户端，即更外层）/ append middleware (first Use wraps outermost).
func (e *Engine) Use(mw ...Middleware) *Engine {
	e.mw = append(e.mw, mw...)
	return e
}

// DisableTrace 关闭默认的 X-Trace-ID 中间件 / disables default trace middleware.
func (e *Engine) DisableTrace() *Engine {
	e.trace = false
	return e
}

func (e *Engine) routesMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /tasks", e.handleSubmitTasks)
	mux.HandleFunc("GET /adapters/capabilities", e.handleAdapterCapabilities)
	mux.HandleFunc("GET /adapters/tools", e.handleAdapterTools)
	mux.HandleFunc("POST /adapters/translate", e.handleAdapterTranslate)
	mux.HandleFunc("POST /adapters/actions", e.handleAdapterActions)
	mux.HandleFunc("GET /mcp/tools", e.handleMCPListTools)
	mux.HandleFunc("POST /mcp/call", e.handleMCPCallTool)
	mux.HandleFunc("GET /mcp/tasks/{id}", e.handleMCPGetTask)
	mux.HandleFunc("GET /tasks/{id}", e.handleGetTask)
	mux.HandleFunc("GET /tasks", e.handleListTasks)
	mux.HandleFunc("POST /tasks/{id}/cancel", e.handleCancelTask)
	mux.HandleFunc("DELETE /tasks/{id}", e.handleDeleteTask)
	mux.HandleFunc("GET /health", e.handleHealth)
	mux.HandleFunc("GET /metrics", e.handleMetrics)
	return mux
}

// Handler 返回完整处理链 / returns the full handler chain.
func (e *Engine) Handler() http.Handler {
	h := http.Handler(e.routesMux())
	for i := len(e.mw) - 1; i >= 0; i-- {
		h = e.mw[i](h)
	}
	if e.trace {
		h = observability.TraceMiddleware(h)
	}
	return h
}

// Mount 将引擎挂到已有 ServeMux 的 path 前缀下（prefix 如 /execgo，勿尾斜杠）/ mounts under prefix on parent mux.
func Mount(parent *http.ServeMux, prefix string, e *Engine) {
	prefix = strings.TrimSuffix(prefix, "/")
	sub := http.StripPrefix(prefix, e.Handler())
	parent.Handle(prefix+"/", sub)
}

// ----------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------

func (e *Engine) handleSubmitTasks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logger := observability.L(ctx, e.logger)

	var graph models.TaskGraph
	if err := json.NewDecoder(r.Body).Decode(&graph); err != nil {
		logger.Warn("invalid request body", "error", err)
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid JSON: " + err.Error()})
		return
	}

	submit, err := e.validateAndSubmitGraph(ctx, &graph)
	if err != nil {
		logger.Warn("task graph submission rejected", "error", err)
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	logger.Info("task graph submitted", "task_count", submit.Accepted)
	writeJSON(w, http.StatusAccepted, submit)
}

func (e *Engine) validateAndSubmitGraph(ctx context.Context, graph *models.TaskGraph) (models.SubmitResponse, error) {
	_ = ctx
	if err := graph.Validate(); err != nil {
		return models.SubmitResponse{}, err
	}

	for _, task := range graph.Tasks {
		executor.NormalizeTask(task)
		if _, err := executor.Get(task.Type); err != nil {
			return models.SubmitResponse{}, fmt.Errorf("unknown task type: %s (available: %s)", task.Type, strings.Join(executor.RegisteredTypes(), ", "))
		}
	}

	e.scheduler.Submit(graph)

	ids := make([]string, len(graph.Tasks))
	for i, t := range graph.Tasks {
		ids[i] = t.ID
	}
	return models.SubmitResponse{
		Accepted: len(graph.Tasks),
		TaskIDs:  ids,
	}, nil
}

func (e *Engine) handleAdapterCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, e.adapter.Capabilities())
}

func (e *Engine) handleAdapterTools(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, e.adapter.ToolManifest())
}

func (e *Engine) handleAdapterTranslate(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logger := observability.L(ctx, e.logger)

	var req adapter.AgentActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.Warn("invalid adapter translate body", "error", err)
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid JSON: " + err.Error()})
		return
	}
	resp, err := e.adapter.Translate(req)
	if err != nil {
		logger.Warn("adapter translation failed", "error", err)
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (e *Engine) handleAdapterActions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logger := observability.L(ctx, e.logger)

	var req adapter.AgentActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.Warn("invalid adapter action body", "error", err)
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid JSON: " + err.Error()})
		return
	}
	resp, err := e.adapter.Translate(req)
	if err != nil {
		logger.Warn("adapter action translation failed", "error", err)
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}
	submit, err := e.validateAndSubmitGraph(ctx, resp.TaskGraph)
	if err != nil {
		logger.Warn("adapter task graph submission rejected", "error", err)
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}
	resp.Accepted = submit.Accepted
	resp.TaskIDs = submit.TaskIDs
	logger.Info("adapter action submitted", "task_count", resp.Accepted, "adapter", req.Adapter)
	writeJSON(w, http.StatusAccepted, resp)
}

func (e *Engine) handleMCPListTools(w http.ResponseWriter, r *http.Request) {
	ex, err := executor.Get("mcp")
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, models.ErrorResponse{Error: err.Error()})
		return
	}
	tools, err := ex.ListTools(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": tools})
}

func (e *Engine) handleMCPCallTool(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID       string          `json:"id"`
		ToolName string          `json:"tool_name"`
		Input    json.RawMessage `json:"input"`
		Timeout  int64           `json:"timeout,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid JSON: " + err.Error()})
		return
	}
	ex, err := executor.Get("mcp")
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, models.ErrorResponse{Error: err.Error()})
		return
	}
	task := &models.Task{
		ID:       req.ID,
		Type:     "mcp",
		ToolName: req.ToolName,
		Input:    req.Input,
		Timeout:  req.Timeout,
	}
	res, err := ex.Execute(r.Context(), task)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, res)
}

func (e *Engine) handleMCPGetTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ex, err := executor.Get("mcp")
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, models.ErrorResponse{Error: err.Error()})
		return
	}
	mcpExec, ok := ex.(*executor.MCPExecutor)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "mcp executor type mismatch"})
		return
	}
	res, found := mcpExec.GetHandle(id)
	if !found {
		writeJSON(w, http.StatusNotFound, models.ErrorResponse{Error: "handle not found: " + id})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (e *Engine) handleGetTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	task, ok := e.state.Get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, models.ErrorResponse{Error: "task not found: " + id})
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (e *Engine) handleListTasks(w http.ResponseWriter, r *http.Request) {
	tasks := e.state.GetAll()
	writeJSON(w, http.StatusOK, tasks)
}

func (e *Engine) handleCancelTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	result, found, err := e.scheduler.Cancel(id)
	if !found {
		writeJSON(w, http.StatusNotFound, models.ErrorResponse{Error: "task not found: " + id})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: err.Error()})
		return
	}
	task, _ := e.state.Get(id)
	var event *models.RuntimeEvent
	if task != nil && len(task.Events) > 0 {
		event = &task.Events[len(task.Events)-1]
	}
	writeJSON(w, http.StatusAccepted, models.CancelTaskResponse{
		TaskID:  id,
		Status:  taskStatusValue(task),
		Runtime: runtimePayload(task, result),
		Event:   event,
	})
}

func (e *Engine) handleDeleteTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !e.state.Delete(id) {
		writeJSON(w, http.StatusNotFound, models.ErrorResponse{Error: "task not found: " + id})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (e *Engine) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, models.HealthResponse{
		Status:  "ok",
		Version: execgoversion.Current,
		Uptime:  time.Since(e.startTime).Round(time.Second).String(),
	})
}

func (e *Engine) handleMetrics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, models.MetricsResponse{
		TasksTotal:     e.metrics.TasksTotal.Load(),
		TasksRunning:   e.metrics.TasksRunning.Load(),
		TasksSucceeded: e.metrics.TasksSucceeded.Load(),
		TasksFailed:    e.metrics.TasksFailed.Load(),
		TasksCancelled: e.metrics.TasksCancelled.Load(),
		ByType:         e.metrics.Snapshot(),
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func taskStatusValue(task *models.Task) models.TaskStatus {
	if task == nil {
		return ""
	}
	return task.Status
}

func runtimePayload(task *models.Task, result *executor.Result) *models.RuntimeResult {
	if task != nil && task.Runtime != nil {
		return task.Runtime
	}
	if result == nil {
		return nil
	}
	return &models.RuntimeResult{
		Status:   result.Status,
		HandleID: result.HandleID,
		Error:    result.Error,
	}
}
