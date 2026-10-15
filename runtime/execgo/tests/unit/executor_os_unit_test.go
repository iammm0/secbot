package unit_test

import (
	"context"
	"encoding/json"
	"os"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
)

func TestOSNoopExecutor_Execute(t *testing.T) {
	e := &executor.NoopExecutor{}
	raw, err := e.Execute(context.Background(), &models.Task{Params: json.RawMessage(`{"message":"hi"}`)})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if m["ok"] != true {
		t.Fatalf("expected ok true, got %v", m["ok"])
	}
	if m["message"] != "hi" {
		t.Fatalf("message: %v", m["message"])
	}
}

func TestOSSleepExecutor_Execute_zero(t *testing.T) {
	e := &executor.SleepExecutor{}
	task := &models.Task{Params: json.RawMessage(`{"duration_ms":0}`)}
	raw, err := e.Execute(context.Background(), task)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	if int64(m["slept_ms"].(float64)) != 0 {
		t.Fatalf("slept_ms: %v", m["slept_ms"])
	}
}

func TestOSSleepExecutor_Execute_short(t *testing.T) {
	e := &executor.SleepExecutor{}
	task := &models.Task{Params: json.RawMessage(`{"duration_ms":1}`)}
	start := time.Now()
	_, err := e.Execute(context.Background(), task)
	if err != nil {
		t.Fatal(err)
	}
	if d := time.Since(start); d < time.Millisecond {
		t.Fatalf("expected at least 1ms, got %v", d)
	}
}

func TestOSSleepExecutor_Execute_cancel(t *testing.T) {
	e := &executor.SleepExecutor{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	task := &models.Task{Params: json.RawMessage(`{"duration_ms":60000}`)}
	_, err := e.Execute(ctx, task)
	if err == nil {
		t.Fatal("expected cancel error")
	}
}

func TestOSSleepExecutor_Execute_exceedsMax(t *testing.T) {
	e := &executor.SleepExecutor{}
	ms := executor.SleepMaxDuration.Milliseconds() + 1
	task := &models.Task{Params: json.RawMessage(`{"duration_ms":` + strconv.FormatInt(ms, 10) + `}`)}
	_, err := e.Execute(context.Background(), task)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestOSShellExecutor_DirectSuccess(t *testing.T) {
	e := &executor.ShellExecutor{}
	task := &models.Task{
		Params: json.RawMessage(`{"command":"hostname"}`),
	}
	raw, err := e.Execute(context.Background(), task)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if m["exit_code"].(float64) != 0 {
		t.Fatalf("exit_code: %v", m["exit_code"])
	}
	if strings.TrimSpace(m["stdout"].(string)) == "" {
		t.Fatalf("stdout should not be empty, got %q", m["stdout"])
	}
}

func TestOSShellExecutor_ScriptAutoRunner(t *testing.T) {
	e := &executor.ShellExecutor{}
	task := &models.Task{
		Params: json.RawMessage(`{"runner":"auto","script":"echo hello"}`),
	}
	raw, err := e.Execute(context.Background(), task)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if m["exit_code"].(float64) != 0 {
		t.Fatalf("exit_code: %v", m["exit_code"])
	}
	wantRunner := "sh"
	if runtime.GOOS == "windows" {
		wantRunner = "powershell"
	}
	if m["runner"] != wantRunner {
		t.Fatalf("runner: got %v want %s", m["runner"], wantRunner)
	}
}

func TestOSShellExecutor_InvalidRunner(t *testing.T) {
	e := &executor.ShellExecutor{}
	task := &models.Task{
		Params: json.RawMessage(`{"runner":"bad","script":"echo hello"}`),
	}
	_, err := e.Execute(context.Background(), task)
	if err == nil {
		t.Fatal("expected invalid runner error")
	}
}

func TestOSShellExecutor_PolicyDifference(t *testing.T) {
	e := &executor.ShellExecutor{}
	old := os.Getenv(executor.ShellPolicyEnv)
	defer os.Setenv(executor.ShellPolicyEnv, old)

	_ = os.Unsetenv(executor.ShellPolicyEnv)
	task := &models.Task{
		Params: json.RawMessage(`{"command":"not-a-real-whitelisted-command"}`),
	}
	_, err := e.Execute(context.Background(), task)
	if err == nil {
		t.Fatal("expected whitelist error")
	}

	if err := os.Setenv(executor.ShellPolicyEnv, executor.ShellPolicyOpen); err != nil {
		t.Fatal(err)
	}
	_, err = e.Execute(context.Background(), task)
	if err == nil {
		t.Fatal("expected command run failure under open mode")
	}
	if !strings.Contains(err.Error(), "command failed") {
		t.Fatalf("unexpected error: %v", err)
	}
}
