//go:build !grpc

// gRPC stub (build tag: !grpc) / gRPC 桩实现（构建标签：!grpc）。
// Author: iammm0; Last edited: 2026-04-23
package main

import (
	"log/slog"

	"github.com/iammm0/execgo/pkg/observability"
	"github.com/iammm0/execgo/pkg/scheduler"
	"github.com/iammm0/execgo/pkg/store"
)

// startGRPCServer 默认在未启用 `-tags grpc` 时不会启动任何 gRPC 服务。
func startGRPCServer(addr string, st store.Store, sched *scheduler.Scheduler, metrics *observability.Metrics, logger *slog.Logger) (func(), error) {
	_ = addr
	_ = st
	_ = sched
	_ = metrics
	_ = logger
	return nil, nil
}
