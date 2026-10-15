// execgocli 包单元测试 / unit tests for internal/execgocli.
package unit_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/iammm0/execgo/internal/execgocli"
	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/tests/testutil"
)

func TestExecgocliClient_CapabilitiesAndActWait(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 2)
	srv := testutil.NewHTTPServer(t, rt)
	t.Setenv("EXECGO_URL", srv.URL)

	c := execgocli.NewClient(execgocli.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	m, _, _, err := c.GetCapabilities(ctx)
	if err != nil {
		t.Fatalf("capabilities: %v", err)
	}
	if m["schema_version"] != "adapter.v1" {
		t.Fatalf("schema_version: %v", m["schema_version"])
	}

	body := []byte(`{
		"adapter":"codex",
		"action_id":"e2e-1",
		"action":{"kind":"os.noop","input":{}}
	}`)
	am, _, _, err := c.PostActions(ctx, body)
	if err != nil {
		t.Fatalf("act: %v", err)
	}
	ids, ok := am["task_ids"].([]any)
	if !ok || len(ids) < 1 {
		t.Fatalf("task_ids: %#v", am)
	}
	id, _ := ids[0].(string)
	if id == "" {
		t.Fatal("empty task id")
	}

	// 等待 store 中任务终态
	testutil.WaitTaskInStore(t, rt.Store, id, 2*time.Second)

	wout, err := execgocli.Wait(ctx, c, []string{id}, 50*time.Millisecond, 0)
	if err != nil {
		t.Fatalf("wait: %v", err)
	}
	if !wout.AllTerminal {
		t.Fatalf("expected terminal, got %#v", wout)
	}
}

func TestExecgocliClient_Cancel(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 1)
	srv := testutil.NewHTTPServer(t, rt)
	t.Setenv("EXECGO_URL", srv.URL)

	c := execgocli.NewClient(execgocli.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	body := []byte(`{
		"adapter":"codex",
		"action_id":"cancel-1",
		"action":{"kind":"os.sleep","input":{"duration_ms":5000}}
	}`)
	_, _, _, err := c.PostActions(ctx, body)
	if err != nil {
		t.Fatalf("act: %v", err)
	}

	out, err := execgocli.CancelAndWait(ctx, c, []string{"cancel-1"}, 20*time.Millisecond)
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if len(out.Tasks) != 1 {
		t.Fatalf("expected one cancel result, got %#v", out)
	}
	if !out.AllTerminal || out.Wait == nil {
		t.Fatalf("expected cancel --wait style terminal result, got %#v", out)
	}

	task := testutil.WaitTaskInStore(t, rt.Store, "cancel-1", 2*time.Second)
	if task.Status != "cancelled" {
		t.Fatalf("expected cancelled task status, got %s", task.Status)
	}
	if task.Runtime == nil || task.Runtime.Status != "cancelled" {
		t.Fatalf("expected cancelled runtime, got %#v", task.Runtime)
	}
}

func TestExecgocliValidateAdapterActionBody(t *testing.T) {
	valid := []byte(`{
		"adapter":"codex",
		"action_id":"ok",
		"action":{"kind":"os.file","input":{"action":"write","path":"/tmp/out.txt","content":"ok"}}
	}`)
	if err := execgocli.ValidateAdapterActionBody(valid); err != nil {
		t.Fatalf("valid body rejected: %v", err)
	}

	invalid := []byte(`{
		"adapter":"codex",
		"action_id":"bad",
		"action":{"kind":"os.file","input":{"action":"write","path":"/tmp/out.txt"}}
	}`)
	err := execgocli.ValidateAdapterActionBody(invalid)
	if err == nil {
		t.Fatal("expected validation error")
	}
	if !strings.Contains(err.Error(), "content is required") {
		t.Fatalf("error=%q", err.Error())
	}
}
