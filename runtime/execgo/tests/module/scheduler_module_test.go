// Scheduler module tests / 调度器模块测试。
// Author: iammm0; Last edited: 2026-04-23
package module_test

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/tests/testutil"
)

type flakyExecutor struct {
	taskType  string
	failTimes int32
	attempts  atomic.Int32
}

// Name 返回执行器注册名 / returns the executor registry name.
func (e *flakyExecutor) Name() string { return e.taskType }

// Category 返回执行器分类 / returns the executor category.
func (e *flakyExecutor) Category() string { return "test" }

// Execute 按计划失败若干次后成功 / fails a few times as planned, then succeeds.
func (e *flakyExecutor) Execute(ctx context.Context, task *models.Task) (*executor.Result, error) {
	_ = task
	n := e.attempts.Add(1)
	if n <= e.failTimes {
		return nil, fmt.Errorf("planned failure %d", n)
	}
	return &executor.Result{Status: "success", Output: json.RawMessage(`{"ok":true}`)}, nil
}

// ListTools 返回空工具清单 / returns an empty tool list.
func (e *flakyExecutor) ListTools(ctx context.Context) ([]executor.Tool, error) { return nil, nil }

// HealthCheck 总是健康 / always healthy.
func (e *flakyExecutor) HealthCheck() error { return nil }

// Shutdown 无需释放资源 / no-op shutdown.
func (e *flakyExecutor) Shutdown(ctx context.Context) error { return nil }

type failExecutor struct{ taskType string }

// Name 返回执行器注册名 / returns the executor registry name.
func (e *failExecutor) Name() string { return e.taskType }

// Category 返回执行器分类 / returns the executor category.
func (e *failExecutor) Category() string { return "test" }

// Execute 总是失败 / always fails.
func (e *failExecutor) Execute(ctx context.Context, task *models.Task) (*executor.Result, error) {
	_ = ctx
	_ = task
	return &executor.Result{Status: "failed"}, fmt.Errorf("always fail")
}

// ListTools 返回空工具清单 / returns an empty tool list.
func (e *failExecutor) ListTools(ctx context.Context) ([]executor.Tool, error) { return nil, nil }

// HealthCheck 总是健康 / always healthy.
func (e *failExecutor) HealthCheck() error { return nil }

// Shutdown 无需释放资源 / no-op shutdown.
func (e *failExecutor) Shutdown(ctx context.Context) error { return nil }

type asyncHandleExecutor struct {
	taskType string
	mu       sync.RWMutex
	handles  map[string]*executor.Result
}

// Name 返回执行器注册名 / returns the executor registry name.
func (e *asyncHandleExecutor) Name() string { return e.taskType }

// Category 返回执行器分类 / returns the executor category.
func (e *asyncHandleExecutor) Category() string { return "test" }

// Execute 返回非终态结果并异步完成 / returns a non-terminal result and completes asynchronously.
func (e *asyncHandleExecutor) Execute(ctx context.Context, task *models.Task) (*executor.Result, error) {
	handleID := "handle-" + task.ID
	startedAt := time.Now()
	initial := &executor.Result{
		TaskID:    task.ID,
		Status:    models.RuntimeAccepted,
		HandleID:  handleID,
		StartedAt: &startedAt,
	}
	e.mu.Lock()
	e.handles[handleID] = initial
	e.mu.Unlock()

	go func() {
		time.Sleep(120 * time.Millisecond)
		finishedAt := time.Now()
		e.mu.Lock()
		e.handles[handleID] = &executor.Result{
			TaskID:     task.ID,
			Status:     models.RuntimeSuccess,
			HandleID:   handleID,
			StartedAt:  &startedAt,
			FinishedAt: &finishedAt,
			DurationMS: finishedAt.Sub(startedAt).Milliseconds(),
			Output:     json.RawMessage(`{"async":true}`),
		}
		e.mu.Unlock()
	}()

	return initial, nil
}

// GetHandle 按 handle 轮询结果 / polls the handle result.
func (e *asyncHandleExecutor) GetHandle(handleID string) (*executor.Result, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	res, ok := e.handles[handleID]
	if !ok {
		return nil, false
	}
	cp := *res
	return &cp, true
}

// ListTools 返回空工具清单 / returns an empty tool list.
func (e *asyncHandleExecutor) ListTools(ctx context.Context) ([]executor.Tool, error) {
	return nil, nil
}

// HealthCheck 总是健康 / always healthy.
func (e *asyncHandleExecutor) HealthCheck() error { return nil }

// Shutdown 无需释放资源 / no-op shutdown.
func (e *asyncHandleExecutor) Shutdown(ctx context.Context) error { return nil }

type asyncCancelRetryExecutor struct {
	taskType string
	attempts atomic.Int32
	mu       sync.RWMutex
	handles  map[string]*executor.Result
}

func (e *asyncCancelRetryExecutor) Name() string { return e.taskType }

func (e *asyncCancelRetryExecutor) Category() string { return "test" }

func (e *asyncCancelRetryExecutor) Execute(ctx context.Context, task *models.Task) (*executor.Result, error) {
	_ = ctx
	e.attempts.Add(1)
	handleID := "handle-" + task.ID
	res := &executor.Result{
		TaskID:   task.ID,
		Status:   models.RuntimeRunning,
		HandleID: handleID,
	}
	e.mu.Lock()
	e.handles[handleID] = res
	e.mu.Unlock()
	return res, nil
}

func (e *asyncCancelRetryExecutor) GetHandle(handleID string) (*executor.Result, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	res, ok := e.handles[handleID]
	if !ok {
		return nil, false
	}
	cp := *res
	return &cp, true
}

func (e *asyncCancelRetryExecutor) CancelHandle(handleID string) (*executor.Result, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	res, ok := e.handles[handleID]
	if !ok {
		return nil, false
	}
	cancelled := &executor.Result{
		TaskID:   res.TaskID,
		Status:   models.RuntimeCancelled,
		HandleID: handleID,
		Error: &models.RuntimeError{
			Code:    models.ErrorCancelled,
			Message: "task cancelled",
			Source:  "test",
		},
	}
	e.handles[handleID] = cancelled
	return cancelled, true
}

func (e *asyncCancelRetryExecutor) ListTools(ctx context.Context) ([]executor.Tool, error) {
	return nil, nil
}

func (e *asyncCancelRetryExecutor) HealthCheck() error { return nil }

func (e *asyncCancelRetryExecutor) Shutdown(ctx context.Context) error { return nil }

// TestScheduler_RetryThenSuccess verifies retry then success / 验证重试后成功。
func TestScheduler_RetryThenSuccess(t *testing.T) {
	rt := testutil.NewRuntime(t, 2)

	taskType := fmt.Sprintf("flaky-%d", time.Now().UnixNano())
	flaky := &flakyExecutor{taskType: taskType, failTimes: 1}
	executor.Register(flaky)

	rt.Scheduler.Submit(&models.TaskGraph{
		Tasks: []*models.Task{
			{ID: "retry-task", Type: taskType, Retry: 1},
		},
	})

	task := testutil.WaitTaskInStore(t, rt.Store, "retry-task", 4*time.Second)
	if task.Status != models.StatusSuccess {
		t.Fatalf("expected success, got %s (error=%s)", task.Status, task.Error)
	}
	if task.Runtime == nil {
		t.Fatal("expected runtime envelope on successful task")
	}
	if task.Runtime.Status != models.RuntimeSuccess {
		t.Fatalf("expected runtime success, got %s", task.Runtime.Status)
	}
	if task.Runtime.Attempt != 2 {
		t.Fatalf("expected runtime attempt=2, got %d", task.Runtime.Attempt)
	}
	if task.RunStatus != string(models.RuntimeSuccess) {
		t.Fatalf("expected run_status=%q, got %q", models.RuntimeSuccess, task.RunStatus)
	}
	if got := flaky.attempts.Load(); got != 2 {
		t.Fatalf("expected 2 attempts, got %d", got)
	}
}

// TestScheduler_FailurePropagatesSkip verifies downstream skip on failure / 验证失败向下游传播 skip。
func TestScheduler_FailurePropagatesSkip(t *testing.T) {
	rt := testutil.NewRuntime(t, 2)
	executor.RegisterBuiltins()

	taskType := fmt.Sprintf("fail-%d", time.Now().UnixNano())
	executor.Register(&failExecutor{taskType: taskType})

	rt.Scheduler.Submit(&models.TaskGraph{
		Tasks: []*models.Task{
			{ID: "a", Type: taskType},
			{ID: "b", Type: "noop", DependsOn: []string{"a"}},
			{ID: "c", Type: "noop", DependsOn: []string{"b"}},
		},
	})

	taskA := testutil.WaitTaskInStore(t, rt.Store, "a", 4*time.Second)
	taskB := testutil.WaitTaskInStore(t, rt.Store, "b", 4*time.Second)
	taskC := testutil.WaitTaskInStore(t, rt.Store, "c", 4*time.Second)

	if taskA.Status != models.StatusFailed {
		t.Fatalf("task a should fail, got %s", taskA.Status)
	}
	if taskA.Runtime == nil {
		t.Fatal("expected runtime envelope on failed task")
	}
	if taskA.Runtime.Status != models.RuntimeFailed {
		t.Fatalf("expected runtime failed, got %s", taskA.Runtime.Status)
	}
	if taskA.Runtime.Error == nil {
		t.Fatal("expected structured runtime error on failed task")
	}
	if taskB.Status != models.StatusSkipped {
		t.Fatalf("task b should be skipped, got %s", taskB.Status)
	}
	if taskB.Runtime != nil {
		t.Fatalf("expected skipped task runtime to be nil, got %+v", taskB.Runtime)
	}
	if taskC.Status != models.StatusSkipped {
		t.Fatalf("task c should be skipped, got %s", taskC.Status)
	}
	if taskC.Runtime != nil {
		t.Fatalf("expected skipped task runtime to be nil, got %+v", taskC.Runtime)
	}
}

// TestScheduler_AsyncHandleBlocksDependentsUntilTerminal verifies async handle behavior / 验证异步 handle 阻塞下游直到终态。
func TestScheduler_AsyncHandleBlocksDependentsUntilTerminal(t *testing.T) {
	rt := testutil.NewRuntime(t, 2)
	executor.RegisterBuiltins()

	taskType := fmt.Sprintf("async-%d", time.Now().UnixNano())
	asyncExec := &asyncHandleExecutor{
		taskType: taskType,
		handles:  make(map[string]*executor.Result),
	}
	executor.Register(asyncExec)

	rt.Scheduler.Submit(&models.TaskGraph{
		Tasks: []*models.Task{
			{ID: "async-parent", Type: taskType},
			{ID: "child", Type: "noop", DependsOn: []string{"async-parent"}},
		},
	})

	time.Sleep(40 * time.Millisecond)
	if child, ok := rt.Store.Get("child"); ok && child.Status != models.StatusPending {
		t.Fatalf("expected child to remain pending before async parent is terminal, got %s", child.Status)
	}

	parent := testutil.WaitTaskInStore(t, rt.Store, "async-parent", 4*time.Second)
	child := testutil.WaitTaskInStore(t, rt.Store, "child", 4*time.Second)

	if parent.Runtime == nil {
		t.Fatal("expected async parent runtime envelope")
	}
	if parent.Runtime.Status != models.RuntimeSuccess {
		t.Fatalf("expected async parent runtime success, got %s", parent.Runtime.Status)
	}
	if parent.HandleID == "" {
		t.Fatal("expected async parent handle_id to be populated")
	}
	if child.Status != models.StatusSuccess {
		t.Fatalf("expected child success after async parent terminal, got %s", child.Status)
	}
}

// TestScheduler_CancelledAsyncTaskDoesNotRetry verifies cancellation stops retry attempts / 验证取消不会触发重试。
func TestScheduler_CancelledAsyncTaskDoesNotRetry(t *testing.T) {
	rt := testutil.NewRuntime(t, 1)

	taskType := fmt.Sprintf("cancel-retry-%d", time.Now().UnixNano())
	cancelExec := &asyncCancelRetryExecutor{
		taskType: taskType,
		handles:  make(map[string]*executor.Result),
	}
	executor.Register(cancelExec)

	rt.Scheduler.Submit(&models.TaskGraph{
		Tasks: []*models.Task{
			{ID: "cancel-retry-task", Type: taskType, Retry: 2},
		},
	})

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if task, ok := rt.Store.Get("cancel-retry-task"); ok && task.HandleID != "" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	if _, found, err := rt.Scheduler.Cancel("cancel-retry-task"); !found || err != nil {
		t.Fatalf("cancel found=%v err=%v", found, err)
	}

	task := testutil.WaitTaskInStore(t, rt.Store, "cancel-retry-task", 4*time.Second)
	if task.Runtime == nil || task.Runtime.Status != models.RuntimeCancelled {
		t.Fatalf("expected runtime cancelled, got %#v", task.Runtime)
	}
	if got := cancelExec.attempts.Load(); got != 1 {
		t.Fatalf("expected cancellation to stop retries after 1 attempt, got %d", got)
	}
}
