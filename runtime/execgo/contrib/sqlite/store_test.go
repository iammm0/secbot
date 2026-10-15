package sqlite

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/iammm0/execgo/pkg/models"
)

func openTest(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestPutAndGet(t *testing.T) {
	s := openTest(t)
	task := &models.Task{ID: "t1", Status: models.StatusPending}
	s.Put(task)

	got, ok := s.Get("t1")
	if !ok {
		t.Fatal("expected task")
	}
	if got.ID != "t1" || got.Status != models.StatusPending {
		t.Fatalf("unexpected task: %+v", got)
	}
}

func TestGetMissing(t *testing.T) {
	s := openTest(t)
	_, ok := s.Get("nope")
	if ok {
		t.Fatal("expected not found")
	}
}

func TestGetAll(t *testing.T) {
	s := openTest(t)
	s.Put(&models.Task{ID: "a", Status: models.StatusPending})
	s.Put(&models.Task{ID: "b", Status: models.StatusRunning})

	all := s.GetAll()
	if len(all) != 2 {
		t.Fatalf("expected 2, got %d", len(all))
	}
}

func TestDelete(t *testing.T) {
	s := openTest(t)
	s.Put(&models.Task{ID: "d1", Status: models.StatusPending})

	if !s.Delete("d1") {
		t.Fatal("expected delete to return true")
	}
	if s.Delete("d1") {
		t.Fatal("expected second delete to return false")
	}
	if _, ok := s.Get("d1"); ok {
		t.Fatal("expected task to be gone")
	}
}

func TestUpdateStatus(t *testing.T) {
	s := openTest(t)
	s.Put(&models.Task{ID: "u1", Status: models.StatusPending})

	result := json.RawMessage(`{"out":"ok"}`)
	ok := s.UpdateStatus("u1", models.StatusSuccess, result, "")
	if !ok {
		t.Fatal("expected update to succeed")
	}

	got, _ := s.Get("u1")
	if got.Status != models.StatusSuccess {
		t.Fatalf("expected success, got %s", got.Status)
	}
	if string(got.Result) != `{"out":"ok"}` {
		t.Fatalf("unexpected result: %s", got.Result)
	}
}

func TestUpdateStatusMissing(t *testing.T) {
	s := openTest(t)
	if s.UpdateStatus("nope", models.StatusFailed, nil, "err") {
		t.Fatal("expected false for missing task")
	}
}

func TestPutOverwrites(t *testing.T) {
	s := openTest(t)
	s.Put(&models.Task{ID: "o1", Status: models.StatusPending})
	s.Put(&models.Task{ID: "o1", Status: models.StatusRunning})

	got, _ := s.Get("o1")
	if got.Status != models.StatusRunning {
		t.Fatalf("expected running, got %s", got.Status)
	}
}
