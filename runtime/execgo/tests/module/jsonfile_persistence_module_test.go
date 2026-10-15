// JSON file store persistence module tests / JSON 文件存储持久化模块测试。
// Author: iammm0; Last edited: 2026-04-23
package module_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/pkg/store/jsonfile"
)

// TestJSONFileManager_PersistAndRecover verifies persist and recovery / 验证持久化与恢复流程。
func TestJSONFileManager_PersistAndRecover(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	dataDir := t.TempDir()

	mgr, err := jsonfile.NewManager(dataDir, logger)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}

	now := time.Now()
	runningTask := &models.Task{
		ID:        "running-task",
		Type:      "noop",
		Status:    models.StatusRunning,
		CreatedAt: now,
		UpdatedAt: now,
	}
	successTask := &models.Task{
		ID:        "success-task",
		Type:      "noop",
		Status:    models.StatusSuccess,
		Result:    json.RawMessage(`{"ok":true}`),
		CreatedAt: now,
		UpdatedAt: now,
	}

	mgr.Put(runningTask)
	mgr.Put(successTask)
	if err := mgr.Persist(); err != nil {
		t.Fatalf("persist: %v", err)
	}

	recovered, err := jsonfile.NewManager(dataDir, logger)
	if err != nil {
		t.Fatalf("new recovered manager: %v", err)
	}

	gotRunning, ok := recovered.Get("running-task")
	if !ok {
		t.Fatal("expected recovered running-task")
	}
	if gotRunning.Status != models.StatusPending {
		t.Fatalf("expected recovered running task to reset to pending, got %s", gotRunning.Status)
	}

	gotSuccess, ok := recovered.Get("success-task")
	if !ok {
		t.Fatal("expected recovered success-task")
	}
	if gotSuccess.Status != models.StatusSuccess {
		t.Fatalf("expected success-task status=%s, got %s", models.StatusSuccess, gotSuccess.Status)
	}
	var got map[string]any
	if err := json.Unmarshal(gotSuccess.Result, &got); err != nil {
		t.Fatalf("unmarshal recovered result: %v", err)
	}
	if ok, _ := got["ok"].(bool); !ok {
		t.Fatalf("expected recovered result ok=true, got %v", got["ok"])
	}
}
