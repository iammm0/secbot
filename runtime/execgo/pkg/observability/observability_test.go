package observability

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewTraceID(t *testing.T) {
	id := NewTraceID()
	if len(id) != 16 {
		t.Fatalf("expected 16 hex chars, got %d: %q", len(id), id)
	}
}

func TestWithTraceIDRoundTrip(t *testing.T) {
	ctx := WithTraceID(context.Background(), "abc123")
	if got := TraceIDFromContext(ctx); got != "abc123" {
		t.Fatalf("expected abc123, got %q", got)
	}
}

func TestTraceIDFromContextEmpty(t *testing.T) {
	if got := TraceIDFromContext(context.Background()); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestTraceMiddlewareInjectsID(t *testing.T) {
	handler := TraceMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tid := TraceIDFromContext(r.Context())
		if tid == "" {
			t.Fatal("expected trace ID in context")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Header().Get("X-Trace-ID") == "" {
		t.Fatal("expected X-Trace-ID response header")
	}
}

func TestTraceMiddlewareUsesExistingHeader(t *testing.T) {
	handler := TraceMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Trace-ID", "custom-id")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if got := rec.Header().Get("X-Trace-ID"); got != "custom-id" {
		t.Fatalf("expected custom-id, got %q", got)
	}
}

func TestMetricsIncType(t *testing.T) {
	m := NewMetrics()
	m.IncType("shell")
	m.IncType("shell")
	m.IncType("http")

	snap := m.Snapshot()
	if snap["shell"] != 2 {
		t.Fatalf("expected shell=2, got %d", snap["shell"])
	}
	if snap["http"] != 1 {
		t.Fatalf("expected http=1, got %d", snap["http"])
	}
}

func TestMetricsAtomicCounters(t *testing.T) {
	m := NewMetrics()
	m.TasksTotal.Add(5)
	m.TasksRunning.Add(2)
	m.TasksSucceeded.Add(3)

	if m.TasksTotal.Load() != 5 {
		t.Fatal("TasksTotal mismatch")
	}
	if m.TasksRunning.Load() != 2 {
		t.Fatal("TasksRunning mismatch")
	}
	if m.TasksSucceeded.Load() != 3 {
		t.Fatal("TasksSucceeded mismatch")
	}
}
