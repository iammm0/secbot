// Scheduler timeout module tests / 调度器超时模块测试。
// Author: iammm0; Last edited: 2026-04-23
package module_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/tests/testutil"
)

type timeoutExecutor struct {
	taskType string
}

// Name 返回执行器注册名 / returns the executor registry name.
func (e *timeoutExecutor) Name() string { return e.taskType }

// Category 返回执行器分类 / returns the executor category.
func (e *timeoutExecutor) Category() string { return "test" }

// ListTools 返回空工具清单 / returns an empty tool list.
func (e *timeoutExecutor) ListTools(ctx context.Context) ([]executor.Tool, error) {
	return nil, nil
}

// HealthCheck 总是健康 / always healthy.
func (e *timeoutExecutor) HealthCheck() error { return nil }

// Shutdown 无需释放资源 / no-op shutdown.
func (e *timeoutExecutor) Shutdown(ctx context.Context) error { return nil }

// Execute 等待 ctx 超时或取消 / waits for ctx to timeout or cancel.
func (e *timeoutExecutor) Execute(ctx context.Context, task *models.Task) (*executor.Result, error) {
	_ = task
	<-ctx.Done()
	return nil, ctx.Err()
}

// TestScheduler_TimeoutProducesStructuredRuntimeError verifies timeout error normalization / 验证超时错误归一化。
func TestScheduler_TimeoutProducesStructuredRuntimeError(t *testing.T) {
	rt := testutil.NewRuntime(t, 1)
	taskType := fmt.Sprintf("timeout-%d", time.Now().UnixNano())
	executor.Register(&timeoutExecutor{taskType: taskType})

	rt.Scheduler.Submit(&models.TaskGraph{
		Tasks: []*models.Task{
			{
				ID:      "timeout-task",
				Type:    taskType,
				Timeout: 50, // ms
			},
		},
	})

	task := testutil.WaitTaskInStore(t, rt.Store, "timeout-task", 4*time.Second)
	if task.Status != models.StatusFailed {
		t.Fatalf("expected status=%s, got %s", models.StatusFailed, task.Status)
	}
	if task.Runtime == nil {
		t.Fatal("expected runtime envelope on timeout failure")
	}
	if task.Runtime.Status != models.RuntimeFailed {
		t.Fatalf("expected runtime status=%s, got %s", models.RuntimeFailed, task.Runtime.Status)
	}
	if task.Runtime.Error == nil {
		t.Fatal("expected runtime error on timeout")
	}
	if task.Runtime.Error.Code != models.ErrorTimeout {
		t.Fatalf("expected error code=%s, got %s", models.ErrorTimeout, task.Runtime.Error.Code)
	}
	if !task.Runtime.Error.Retryable {
		t.Fatal("expected timeout runtime error to be retryable")
	}
	if task.Runtime.Attempt != 1 {
		t.Fatalf("expected attempt=1, got %d", task.Runtime.Attempt)
	}
	if task.RunStatus != string(models.RuntimeFailed) {
		t.Fatalf("expected run_status=%q, got %q", models.RuntimeFailed, task.RunStatus)
	}
}
