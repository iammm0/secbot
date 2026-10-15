// gRPC server implementation for ExecGo / ExecGo 的 gRPC 服务实现。
// Author: iammm0; Last edited: 2026-04-23
package grpcserver

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	execgov1 "github.com/iammm0/execgo/contrib/grpcapi/pkg/pb/proto/execgo/v1"
	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/pkg/observability"
	"github.com/iammm0/execgo/pkg/scheduler"
	"github.com/iammm0/execgo/pkg/store"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Server 通过映射现有核心 HTTP 语义实现 ExecGo gRPC 方法 / implements ExecGo gRPC methods by mapping to existing core HTTP semantics.
type Server struct {
	execgov1.UnimplementedExecGoServer

	state   store.Store
	sched   *scheduler.Scheduler
	metrics *observability.Metrics
	logger  *slog.Logger

	startTime time.Time
}

// NewServer 创建 gRPC server 实现 / creates a gRPC server implementation.
func NewServer(st store.Store, sched *scheduler.Scheduler, metrics *observability.Metrics, logger *slog.Logger) *Server {
	return &Server{
		state:     st,
		sched:     sched,
		metrics:   metrics,
		logger:    logger,
		startTime: time.Now(),
	}
}

func taskToProto(t *models.Task) *execgov1.Task {
	var paramsJSON string
	if len(t.Params) > 0 {
		paramsJSON = string(t.Params)
	}
	var resultJSON string
	if len(t.Result) > 0 {
		resultJSON = string(t.Result)
	}
	return &execgov1.Task{
		Id:              t.ID,
		Type:            t.Type,
		ParamsJson:      paramsJSON,
		DependsOn:       t.DependsOn,
		Retry:           int32(t.Retry),
		TimeoutMs:       t.Timeout,
		Status:          string(t.Status),
		ResultJson:      resultJSON,
		Error:           t.Error,
		CreatedAtUnixMs: t.CreatedAt.UnixMilli(),
		UpdatedAtUnixMs: t.UpdatedAt.UnixMilli(),
	}
}

func taskFromProto(t *execgov1.Task) *models.Task {
	var params json.RawMessage
	if t.GetParamsJson() != "" {
		params = json.RawMessage(t.ParamsJson)
	}

	return &models.Task{
		ID:        t.GetId(),
		Type:      t.GetType(),
		Params:    params,
		DependsOn: t.GetDependsOn(),
		Retry:     int(t.GetRetry()),
		Timeout:   t.GetTimeoutMs(),
		// Status/CreatedAt/UpdatedAt 由 scheduler.Submit 和持久化层赋值 / are assigned by scheduler.Submit and the persistence layer.
		Status: models.StatusPending,
	}
}

func (s *Server) SubmitTasks(ctx context.Context, req *execgov1.TaskGraph) (*execgov1.SubmitTasksResponse, error) {
	graph := &models.TaskGraph{}
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "task graph is required")
	}

	graph.Tasks = make([]*models.Task, 0, len(req.GetTasks()))
	for _, pt := range req.GetTasks() {
		graph.Tasks = append(graph.Tasks, taskFromProto(pt))
	}

	if err := graph.Validate(); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	// 提前校验 executor 类型，保持与 HTTP 层一致 / validates executor types early to match HTTP layer behavior.
	for _, task := range graph.Tasks {
		executor.NormalizeTask(task)
		if _, err := executor.Get(task.Type); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "unknown task type %q (available: %v)", task.Type, executor.RegisteredTypes())
		}
	}

	s.sched.Submit(graph)

	ids := make([]string, 0, len(graph.Tasks))
	for _, t := range graph.Tasks {
		ids = append(ids, t.ID)
	}

	return &execgov1.SubmitTasksResponse{
		Accepted: int32(len(graph.Tasks)),
		TaskIds:  ids,
	}, nil
}

func (s *Server) GetTask(ctx context.Context, req *execgov1.GetTaskRequest) (*execgov1.GetTaskResponse, error) {
	if req == nil || req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	task, ok := s.state.Get(req.GetId())
	if !ok {
		return nil, status.Errorf(codes.NotFound, "task not found: %s", req.GetId())
	}

	return &execgov1.GetTaskResponse{Task: taskToProto(task)}, nil
}

func (s *Server) ListTasks(ctx context.Context, req *execgov1.ListTasksRequest) (*execgov1.ListTasksResponse, error) {
	_ = req // no filters for now
	tasks := s.state.GetAll()
	out := &execgov1.ListTasksResponse{Tasks: make([]*execgov1.Task, 0, len(tasks))}
	for _, t := range tasks {
		out.Tasks = append(out.Tasks, taskToProto(t))
	}
	return out, nil
}

func (s *Server) DeleteTask(ctx context.Context, req *execgov1.DeleteTaskRequest) (*execgov1.DeleteTaskResponse, error) {
	if req == nil || req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	if !s.state.Delete(req.GetId()) {
		return nil, status.Errorf(codes.NotFound, "task not found: %s", req.GetId())
	}

	return &execgov1.DeleteTaskResponse{Deleted: true}, nil
}

func (s *Server) Health(ctx context.Context, req *execgov1.HealthRequest) (*execgov1.HealthResponse, error) {
	_ = req
	return &execgov1.HealthResponse{
		Status:  "ok",
		Version: "v0.1.0",
		Uptime:  time.Since(s.startTime).Round(time.Second).String(),
	}, nil
}

func (s *Server) Metrics(ctx context.Context, req *execgov1.MetricsRequest) (*execgov1.MetricsResponse, error) {
	_ = req
	return &execgov1.MetricsResponse{
		TasksTotal:     s.metrics.TasksTotal.Load(),
		TasksRunning:   s.metrics.TasksRunning.Load(),
		TasksSucceeded: s.metrics.TasksSucceeded.Load(),
		TasksFailed:    s.metrics.TasksFailed.Load(),
		ByType:         s.metrics.Snapshot(),
	}, nil
}
