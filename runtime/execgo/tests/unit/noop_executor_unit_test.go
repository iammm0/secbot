// Noop executor unit tests / Noop 执行器单元测试。
// Author: iammm0; Last edited: 2026-04-23
package unit_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
)

// TestNoopExecutor_Blackbox verifies noop executor behavior via public API / 通过公开 API 验证 noop 执行器行为。
func TestNoopExecutor_Blackbox(t *testing.T) {
	e := &executor.NoopExecutor{}
	raw, err := e.Execute(context.Background(), &models.Task{
		Params: json.RawMessage(`{"message":"hello"}`),
	})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if got["ok"] != true {
		t.Fatalf("expected ok=true, got %v", got["ok"])
	}
	if got["message"] != "hello" {
		t.Fatalf("expected message=hello, got %v", got["message"])
	}
}

// TestNoopExecutor_InvalidParams verifies invalid params handling / 验证非法参数处理。
func TestNoopExecutor_InvalidParams(t *testing.T) {
	e := &executor.NoopExecutor{}
	_, err := e.Execute(context.Background(), &models.Task{
		Params: json.RawMessage(`{"message":`),
	})
	if err == nil {
		t.Fatal("expected parse error for invalid params JSON")
	}
}
