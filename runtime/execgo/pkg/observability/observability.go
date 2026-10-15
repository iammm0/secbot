// Package observability 提供结构化日志、请求追踪和指标收集
// provides structured logging, request tracing, and metrics collection.
// Author: iammm0; Last edited: 2026-04-23
package observability

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
)

// ----------------------------------------------------------------
// Trace ID 追踪标识
// ----------------------------------------------------------------

type ctxKey string

const traceIDKey ctxKey = "trace_id"

// NewTraceID 生成 16 字节十六进制追踪 ID / generates a 16-byte hex trace ID.
func NewTraceID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(b)
}

// WithTraceID 将 traceID 注入 context / injects traceID into context.
func WithTraceID(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, traceIDKey, traceID)
}

// TraceIDFromContext 从 context 中提取 traceID / extracts traceID from context.
func TraceIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(traceIDKey).(string); ok {
		return v
	}
	return ""
}

// ----------------------------------------------------------------
// Logger 结构化日志
// ----------------------------------------------------------------

// NewLogger 创建带 JSON 格式的 slog 日志器 / creates a JSON slog logger.
func NewLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
}

// L 返回携带 traceID 的子日志器 / returns a sub-logger with traceID.
func L(ctx context.Context, logger *slog.Logger) *slog.Logger {
	if tid := TraceIDFromContext(ctx); tid != "" {
		return logger.With("trace_id", tid)
	}
	return logger
}

// ----------------------------------------------------------------
// Middleware HTTP 中间件
// ----------------------------------------------------------------

// TraceMiddleware 为每个请求注入 traceID / injects traceID for each request.
func TraceMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := r.Header.Get("X-Trace-ID")
		if traceID == "" {
			traceID = NewTraceID()
		}
		ctx := WithTraceID(r.Context(), traceID)
		w.Header().Set("X-Trace-ID", traceID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ----------------------------------------------------------------
// Metrics 内存指标
// ----------------------------------------------------------------

// Metrics 全局指标收集器 / global metrics collector.
type Metrics struct {
	TasksTotal     atomic.Int64
	TasksRunning   atomic.Int64
	TasksSucceeded atomic.Int64
	TasksFailed    atomic.Int64
	TasksCancelled atomic.Int64

	mu     sync.RWMutex
	ByType map[string]*atomic.Int64
}

// NewMetrics 创建指标实例 / creates a metrics instance.
func NewMetrics() *Metrics {
	return &Metrics{
		ByType: make(map[string]*atomic.Int64),
	}
}

// IncType 增加某类型的计数 / increments a type counter.
func (m *Metrics) IncType(taskType string) {
	m.mu.RLock()
	counter, ok := m.ByType[taskType]
	m.mu.RUnlock()

	if !ok {
		m.mu.Lock()
		counter, ok = m.ByType[taskType]
		if !ok {
			counter = &atomic.Int64{}
			m.ByType[taskType] = counter
		}
		m.mu.Unlock()
	}
	counter.Add(1)
}

// Snapshot 返回当前指标快照 / returns a metrics snapshot.
func (m *Metrics) Snapshot() map[string]int64 {
	m.mu.RLock()
	defer m.mu.RUnlock()

	byType := make(map[string]int64, len(m.ByType))
	for k, v := range m.ByType {
		byType[k] = v.Load()
	}

	return byType
}
