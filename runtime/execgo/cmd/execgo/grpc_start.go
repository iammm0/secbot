//go:build grpc

// gRPC server bootstrap (build tag: grpc) / gRPC 服务启动（构建标签：grpc）。
// Author: iammm0; Last edited: 2026-04-23
package main

import (
	"errors"
	"log/slog"
	"net"

	"github.com/iammm0/execgo/contrib/grpcapi/pkg/grpcserver"
	execgov1 "github.com/iammm0/execgo/contrib/grpcapi/pkg/pb/proto/execgo/v1"
	"github.com/iammm0/execgo/pkg/observability"
	"github.com/iammm0/execgo/pkg/scheduler"
	"github.com/iammm0/execgo/pkg/store"

	"google.golang.org/grpc"
)

// startGRPCServer 启动 gRPC 服务并返回一个可用于优雅关闭的 stop 函数。
func startGRPCServer(addr string, st store.Store, sched *scheduler.Scheduler, metrics *observability.Metrics, logger *slog.Logger) (func(), error) {
	if addr == "" {
		return nil, nil
	}

	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}

	grpcSrv := grpc.NewServer()
	execgov1.RegisterExecGoServer(grpcSrv, grpcserver.NewServer(st, sched, metrics, logger))

	go func() {
		logger.Info("gRPC server listening", "addr", addr)
		if err := grpcSrv.Serve(lis); err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			logger.Error("gRPC server error", "error", err)
		}
	}()

	return func() {
		logger.Info("gRPC server graceful stop", "addr", addr)
		grpcSrv.GracefulStop()
	}, nil
}
