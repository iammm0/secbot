// HTTP integration tests / HTTP 集成测试。
// Author: iammm0; Last edited: 2026-04-23
package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/tests/testutil"
)

type cancellableHTTPExecutor struct {
	taskType string
}

func (e *cancellableHTTPExecutor) Name() string { return e.taskType }

func (e *cancellableHTTPExecutor) Category() string { return "test" }

func (e *cancellableHTTPExecutor) ListTools(ctx context.Context) ([]executor.Tool, error) {
	return nil, nil
}

func (e *cancellableHTTPExecutor) HealthCheck() error { return nil }

func (e *cancellableHTTPExecutor) Shutdown(ctx context.Context) error { return nil }

func (e *cancellableHTTPExecutor) Execute(ctx context.Context, task *models.Task) (*executor.Result, error) {
	_ = task
	<-ctx.Done()
	return nil, ctx.Err()
}

type cancellableRuntimeHTTPExecutor struct {
	taskType       string
	cancelledCount int
}

func (e *cancellableRuntimeHTTPExecutor) Name() string { return e.taskType }

func (e *cancellableRuntimeHTTPExecutor) Category() string { return "test" }

func (e *cancellableRuntimeHTTPExecutor) ListTools(ctx context.Context) ([]executor.Tool, error) {
	return nil, nil
}

func (e *cancellableRuntimeHTTPExecutor) HealthCheck() error { return nil }

func (e *cancellableRuntimeHTTPExecutor) Shutdown(ctx context.Context) error { return nil }

func (e *cancellableRuntimeHTTPExecutor) Execute(ctx context.Context, task *models.Task) (*executor.Result, error) {
	_ = ctx
	return &executor.Result{
		TaskID:   task.ID,
		HandleID: task.ID,
		Status:   models.RuntimeRunning,
	}, nil
}

func (e *cancellableRuntimeHTTPExecutor) GetHandle(handleID string) (*executor.Result, bool) {
	return &executor.Result{
		TaskID:   handleID,
		HandleID: handleID,
		Status:   models.RuntimeRunning,
	}, true
}

func (e *cancellableRuntimeHTTPExecutor) CancelHandle(handleID string) (*executor.Result, bool) {
	e.cancelledCount++
	return &executor.Result{
		TaskID:   handleID,
		HandleID: handleID,
		Status:   models.RuntimeCancelled,
		Error: &models.RuntimeError{
			Code:    models.ErrorCancelled,
			Message: "task cancelled",
			Source:  "test-runtime",
		},
	}, true
}

// TestHTTPTaskFlow_SubmitThenQueryStatus verifies submit->poll flow / 验证提交后轮询查询流程。
func TestHTTPTaskFlow_SubmitThenQueryStatus(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 4)
	srv := testutil.NewHTTPServer(t, rt)
	client := srv.Client()

	healthResp, err := client.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health error: %v", err)
	}
	if healthResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /health status=%d want=%d", healthResp.StatusCode, http.StatusOK)
	}
	_ = healthResp.Body.Close()

	payload := map[string]any{
		"tasks": []map[string]any{
			{"id": "first", "type": "noop", "params": map[string]any{"message": "hi"}},
			{"id": "second", "type": "noop", "depends_on": []string{"first"}},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/tasks", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST /tasks error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("POST /tasks status=%d want=%d", resp.StatusCode, http.StatusAccepted)
	}

	var submit models.SubmitResponse
	if err := json.NewDecoder(resp.Body).Decode(&submit); err != nil {
		t.Fatalf("decode submit response: %v", err)
	}
	if submit.Accepted != 2 {
		t.Fatalf("accepted=%d want=2", submit.Accepted)
	}

	task := pollTaskByHTTP(t, client, srv.URL, "second", 5*time.Second)
	if task.Status != models.StatusSuccess {
		t.Fatalf("task second status=%s error=%s", task.Status, task.Error)
	}
	if task.Runtime == nil {
		t.Fatal("expected runtime envelope in HTTP task payload")
	}
	if task.Runtime.Status != models.RuntimeSuccess {
		t.Fatalf("expected runtime success, got %s", task.Runtime.Status)
	}
	if task.RunStatus != string(models.RuntimeSuccess) {
		t.Fatalf("expected run_status=%q, got %q", models.RuntimeSuccess, task.RunStatus)
	}
	if len(task.Result) == 0 {
		t.Fatal("expected legacy result field to remain populated for compatibility")
	}
}

func TestHTTPTaskFlow_CancelLocalTask(t *testing.T) {
	executor.RegisterBuiltins()
	taskType := "cancel-local-http"
	executor.Register(&cancellableHTTPExecutor{taskType: taskType})
	rt := testutil.NewRuntime(t, 1)
	srv := testutil.NewHTTPServer(t, rt)
	client := srv.Client()

	submitGraph(t, client, srv.URL, map[string]any{
		"tasks": []map[string]any{
			{"id": "local-cancel", "type": taskType},
		},
	})
	waitTaskStatus(t, rt.Store, "local-cancel", models.StatusRunning, 2*time.Second)

	resp, err := client.Post(srv.URL+"/tasks/local-cancel/cancel", "application/json", nil)
	if err != nil {
		t.Fatalf("POST /tasks/{id}/cancel error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("POST /tasks/{id}/cancel status=%d want=%d", resp.StatusCode, http.StatusAccepted)
	}
	var cancelBody struct {
		Status  string                `json:"status"`
		Runtime *models.RuntimeResult `json:"runtime"`
		Event   *models.RuntimeEvent  `json:"event"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cancelBody); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if cancelBody.Status != string(models.StatusCancelling) {
		t.Fatalf("expected cancel response status=%s, got %s", models.StatusCancelling, cancelBody.Status)
	}
	if cancelBody.Runtime == nil || cancelBody.Runtime.Status != models.RuntimeCancelling {
		t.Fatalf("expected cancel response runtime cancelling, got %#v", cancelBody.Runtime)
	}
	if cancelBody.Event == nil || cancelBody.Event.Type != models.RuntimeEventCancelRequested {
		t.Fatalf("expected cancel_requested event, got %#v", cancelBody.Event)
	}

	task := testutil.WaitTaskInStore(t, rt.Store, "local-cancel", 2*time.Second)
	if task.Status != models.StatusCancelled {
		t.Fatalf("expected status=%s, got %s", models.StatusCancelled, task.Status)
	}
	if task.Runtime == nil || task.Runtime.Status != models.RuntimeCancelled {
		t.Fatalf("expected runtime cancelled, got %#v", task.Runtime)
	}
	if task.Runtime.Error == nil || task.Runtime.Error.Code != models.ErrorCancelled {
		t.Fatalf("expected cancelled runtime error, got %#v", task.Runtime)
	}
}

func TestHTTPTaskFlow_CancelRuntimeHandle(t *testing.T) {
	executor.RegisterBuiltins()
	taskType := "cancel-runtime-http"
	cancelExec := &cancellableRuntimeHTTPExecutor{taskType: taskType}
	executor.Register(cancelExec)
	rt := testutil.NewRuntime(t, 1)
	srv := testutil.NewHTTPServer(t, rt)
	client := srv.Client()

	submitGraph(t, client, srv.URL, map[string]any{
		"tasks": []map[string]any{
			{"id": "runtime-cancel", "type": taskType},
		},
	})
	waitTaskStatus(t, rt.Store, "runtime-cancel", models.StatusRunning, 2*time.Second)

	resp, err := client.Post(srv.URL+"/tasks/runtime-cancel/cancel", "application/json", nil)
	if err != nil {
		t.Fatalf("POST /tasks/{id}/cancel error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("POST /tasks/{id}/cancel status=%d want=%d", resp.StatusCode, http.StatusAccepted)
	}
	var cancelBody struct {
		Status  string                `json:"status"`
		Runtime *models.RuntimeResult `json:"runtime"`
		Event   *models.RuntimeEvent  `json:"event"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cancelBody); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if cancelBody.Status != string(models.StatusCancelling) {
		t.Fatalf("expected cancel response status=%s, got %s", models.StatusCancelling, cancelBody.Status)
	}
	if cancelBody.Runtime == nil || cancelBody.Runtime.Status != models.RuntimeCancelling {
		t.Fatalf("expected cancel response runtime cancelling, got %#v", cancelBody.Runtime)
	}
	if cancelBody.Event == nil || cancelBody.Event.Type != models.RuntimeEventCancelRequested {
		t.Fatalf("expected cancel_requested event, got %#v", cancelBody.Event)
	}
	if cancelExec.cancelledCount != 1 {
		t.Fatalf("expected CancelHandle once, got %d", cancelExec.cancelledCount)
	}

	task := testutil.WaitTaskInStore(t, rt.Store, "runtime-cancel", 2*time.Second)
	if task.Status != models.StatusCancelled {
		t.Fatalf("expected status=%s, got %s", models.StatusCancelled, task.Status)
	}
	if task.Runtime == nil || task.Runtime.Status != models.RuntimeCancelled {
		t.Fatalf("expected runtime cancelled, got %#v", task.Runtime)
	}
	if task.HandleID != "runtime-cancel" {
		t.Fatalf("expected handle_id propagated, got %q", task.HandleID)
	}
}

// TestMCPHTTPFlow_ListCallPoll verifies MCP list/call/poll via HTTP / 验证通过 HTTP 的 MCP list/call/poll 流程。
func TestMCPHTTPFlow_ListCallPoll(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 2)
	srv := testutil.NewHTTPServer(t, rt)
	client := srv.Client()

	resp, err := client.Get(srv.URL + "/mcp/tools")
	if err != nil {
		t.Fatalf("GET /mcp/tools error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /mcp/tools status=%d", resp.StatusCode)
	}
	var list map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&list)
	_ = resp.Body.Close()

	body := []byte(`{"id":"mcp-1","tool_name":"demo.echo","input":{"hello":"world"}}`)
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/mcp/call", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	callResp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST /mcp/call error: %v", err)
	}
	if callResp.StatusCode != http.StatusAccepted {
		t.Fatalf("POST /mcp/call status=%d", callResp.StatusCode)
	}
	var accepted map[string]any
	_ = json.NewDecoder(callResp.Body).Decode(&accepted)
	_ = callResp.Body.Close()

	handle, _ := accepted["handle_id"].(string)
	if handle == "" {
		t.Fatalf("expected handle_id")
	}
	time.Sleep(100 * time.Millisecond)
	pollResp, err := client.Get(srv.URL + "/mcp/tasks/" + handle)
	if err != nil {
		t.Fatalf("GET /mcp/tasks/{id} error: %v", err)
	}
	if pollResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /mcp/tasks/{id} status=%d", pollResp.StatusCode)
	}
	var result map[string]any
	_ = json.NewDecoder(pollResp.Body).Decode(&result)
	_ = pollResp.Body.Close()
	if result["status"] != "success" && result["status"] != "running" && result["status"] != "accepted" {
		t.Fatalf("unexpected mcp task status: %v", result["status"])
	}
}

func pollTaskByHTTP(t *testing.T, client *http.Client, baseURL, taskID string, timeout time.Duration) *models.Task {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := client.Get(baseURL + "/tasks/" + taskID)
		if err != nil {
			time.Sleep(20 * time.Millisecond)
			continue
		}
		var task models.Task
		_ = json.NewDecoder(resp.Body).Decode(&task)
		_ = resp.Body.Close()
		if task.Status.IsTerminal() {
			return &task
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("task %s not terminal within %v", taskID, timeout)
	return nil
}

func submitGraph(t *testing.T, client *http.Client, baseURL string, payload map[string]any) {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, baseURL+"/tasks", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST /tasks error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("POST /tasks status=%d want=%d", resp.StatusCode, http.StatusAccepted)
	}
}

func waitTaskStatus(t *testing.T, st interface {
	Get(string) (*models.Task, bool)
}, taskID string, status models.TaskStatus, timeout time.Duration) *models.Task {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		task, ok := st.Get(taskID)
		if ok && task.Status == status {
			return task
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("task %s did not reach status %s within %v", taskID, status, timeout)
	return nil
}
