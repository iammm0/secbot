// Fullserver 演示在独立模块中组合 jsonfile / SQLite 与 Redis 缓存 / demo: compose jsonfile, SQLite, and Redis outside the core module.
// Author: iammm0; Last edited: 2026-04-23
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/iammm0/execgo/contrib/rediscache"
	"github.com/iammm0/execgo/contrib/sqlite"
	"github.com/iammm0/execgo/pkg/config"
	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/httpserver"
	"github.com/iammm0/execgo/pkg/observability"
	"github.com/iammm0/execgo/pkg/scheduler"
	"github.com/iammm0/execgo/pkg/store"
	"github.com/iammm0/execgo/pkg/store/jsonfile"

	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load(config.NewFlagEnvProvider())
	logger := observability.NewLogger()
	slog.SetDefault(logger)

	executor.RegisterBuiltins()

	metrics := observability.NewMetrics()

	var st store.Store
	var persistStop chan struct{}

	backend := os.Getenv("EXECGO_STORE")
	switch backend {
	case "sqlite":
		path := os.Getenv("EXECGO_SQLITE_PATH")
		if path == "" {
			path = filepath.Join(cfg.DataDir, "execgo.db")
		}
		sqlSt, err := sqlite.Open(path)
		if err != nil {
			logger.Error("sqlite open failed", "error", err)
			os.Exit(1)
		}
		defer sqlSt.Close()
		st = sqlSt
		logger.Info("using SQLite store", "path", path)
	default:
		jm, err := jsonfile.NewManager(cfg.DataDir, logger)
		if err != nil {
			logger.Error("jsonfile store failed", "error", err)
			os.Exit(1)
		}
		st = jm
		persistStop = make(chan struct{})
		persistDone := jm.StartPeriodicPersist(30*time.Second, persistStop)
		defer func() {
			if persistStop != nil {
				close(persistStop)
				<-persistDone
			}
			_ = jm.Persist()
		}()
		logger.Info("using jsonfile store", "data_dir", cfg.DataDir)
	}

	if redisURL := os.Getenv("EXECGO_REDIS_URL"); redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err != nil {
			logger.Error("redis url parse failed", "error", err)
			os.Exit(1)
		}
		rdb := redis.NewClient(opt)
		if err := rdb.Ping(context.Background()).Err(); err != nil {
			logger.Error("redis ping failed", "error", err)
			os.Exit(1)
		}
		ttl := 5 * time.Minute
		if s := os.Getenv("EXECGO_REDIS_CACHE_TTL_SEC"); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 {
				ttl = time.Duration(n) * time.Second
			}
		}
		st = rediscache.Wrap(st, rdb, rediscache.Options{TTL: ttl})
		logger.Info("redis read-through cache enabled", "ttl", ttl)
	}

	sched := scheduler.New(st, metrics, logger, cfg.MaxConcurrency)
	sched.Start(context.Background())
	defer sched.Stop()

	engine := httpserver.NewEngine(st, sched, metrics, logger)

	srv := &http.Server{
		Addr:         cfg.HTTPAddr,
		Handler:      engine.Handler(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("fullserver listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.ShutdownTimeout)*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
