// ExecGo — 极简 AI 执行引擎 / Minimal AI Execution Engine.
//
// 为 AI Agent 提供任务提交、DAG 调度、并发执行和可观测性的 HTTP 服务。
// An HTTP service providing task submission, DAG scheduling, concurrent execution,
// and observability for AI agents.
// Author: iammm0; Last edited: 2026-04-23
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/iammm0/execgo/pkg/config"
	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/httpserver"
	"github.com/iammm0/execgo/pkg/observability"
	"github.com/iammm0/execgo/pkg/scheduler"
	"github.com/iammm0/execgo/pkg/store/jsonfile"
)

// main wires all runtime components together:
// config -> logger/metrics -> state manager -> scheduler -> gRPC/HTTP servers.
// main 负责串联所有运行时组件：
// 配置 -> 日志/指标 -> 状态管理 -> 调度器 -> gRPC/HTTP 服务。
func main() {
	// Load configuration from flags and environment variables.
	// 从命令行参数与环境变量加载配置。
	cfg := config.Load(config.NewFlagEnvProvider())

	// Initialize global logger for consistent structured logs.
	// 初始化全局日志器，统一结构化日志输出。
	logger := observability.NewLogger()
	slog.SetDefault(logger)

	logger.Info("ExecGo starting",
		"addr", cfg.HTTPAddr,
		"grpc_addr", cfg.GRPCAddr,
		"data_dir", cfg.DataDir,
		"max_concurrency", cfg.MaxConcurrency,
	)

	// Register all built-in executors before scheduler starts.
	// 在调度器启动前注册所有内置执行器。
	executor.RegisterBuiltins()
	logger.Info("executors registered", "types", executor.RegisteredTypes())

	// Metrics collector for runtime observability.
	// 运行时可观测性指标采集器。
	metrics := observability.NewMetrics()

	// Persistent state manager stores tasks/workflows on disk.
	// 持久化状态管理器，负责将任务/工作流落盘。
	sm, err := jsonfile.NewManager(cfg.DataDir, logger)
	if err != nil {
		logger.Error("failed to initialize state manager", "error", err)
		os.Exit(1)
	}

	// Periodically flush in-memory state to storage.
	// 周期性将内存状态持久化到存储。
	persistStop := make(chan struct{})
	persistDone := sm.StartPeriodicPersist(30*time.Second, persistStop)

	// Start DAG scheduler with configured maximum concurrency.
	// 按配置并发上限启动 DAG 调度器。
	sched := scheduler.New(sm, metrics, logger, cfg.MaxConcurrency)
	sched.Start(context.Background())

	// Start gRPC API for external control/automation.
	// 启动 gRPC API，供外部控制与自动化调用。
	stopGRPC, err := startGRPCServer(cfg.GRPCAddr, sm, sched, metrics, logger)
	if err != nil {
		logger.Error("failed to start gRPC server", "error", err)
		os.Exit(1)
	}

	// Build HTTP engine and expose REST endpoints.
	// 构建 HTTP 引擎并暴露 REST 接口。
	engine := httpserver.NewEngine(sm, sched, metrics, logger)

	httpServer := &http.Server{
		Addr:         cfg.HTTPAddr,
		Handler:      engine.Handler(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Run HTTP server in a separate goroutine.
	// 在独立 goroutine 中运行 HTTP 服务。
	go func() {
		logger.Info("HTTP server listening", "addr", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("HTTP server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for SIGINT/SIGTERM to trigger graceful shutdown.
	// 等待 SIGINT/SIGTERM 信号，触发优雅停机流程。
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	logger.Info("shutdown signal received", "signal", sig)

	// Bound total shutdown time to avoid hanging forever.
	// 设置停机超时上限，避免无限阻塞。
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), time.Duration(cfg.ShutdownTimeout)*time.Second)
	defer shutdownCancel()

	// Stop HTTP first to reject new incoming requests.
	// 先停止 HTTP 服务，拒绝新的外部请求进入。
	logger.Info("stopping HTTP server...")
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("HTTP server shutdown error", "error", err)
	}

	// Stop gRPC server if enabled in current build.
	// 若当前构建启用 gRPC，则同步停止 gRPC 服务。
	if stopGRPC != nil {
		logger.Info("stopping gRPC server...")
		stopGRPC()
	}

	// Stop scheduler workers and in-flight scheduling loop.
	// 停止调度器工作协程与调度循环。
	logger.Info("stopping scheduler...")
	sched.Stop()

	// Flush final state snapshot before process exits.
	// 进程退出前做一次最终状态落盘。
	logger.Info("persisting final state...")
	close(persistStop)
	<-persistDone

	logger.Info("ExecGo stopped gracefully")
}
