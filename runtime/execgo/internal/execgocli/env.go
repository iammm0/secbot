// Package execgocli 为 cmd/execgocli 提供与 ExecGo HTTP API 交互的逻辑（仅标准库）/ stdlib HTTP helpers for the execgocli command.
// Author: iammm0; Last edited: 2026-04-27
package execgocli

import (
	"os"
	"strings"
)

// 环境变量名 / environment variable names（与推广文档、契约说明一致；align with contract docs).
const (
	EnvExecGoURL     = "EXECGO_URL"            // 默认模式 A 控制面地址 / default control-plane base URL
	EnvRuntimeURL    = "EXECGO_RUNTIME_URL"    // execgo 进程与 execgocli ensure 使用的 runtime 基址 / runtime base for ExecGo + CLI
	EnvComposeDir    = "EXECGO_COMPOSE_DIR"    // 含 docker-compose.yml 的 ExecGo 仓库根目录 / repo root with compose file
	EnvRuntimeImage  = "EXECGO_RUNTIME_IMAGE"  // 可选：ensure 拉起的 runtime 镜像 / optional image for ensure-running
	EnvRuntimeSource = "EXECGO_RUNTIME_SOURCE" // 可选：execgo-runtime 源码根（用于输出 cargo 指引）/ source root for cargo hints
)

// DefaultExecGoBaseURL 当未设置 EXECGO_URL 时的默认基址 / default when EXECGO_URL is unset.
const DefaultExecGoBaseURL = "http://127.0.0.1:8080"

// DefaultRuntimeBaseURL 本地同时跑 ExecGo(8080) 与 runtime 时的推荐隔离端口；需与启动 ExecGo 时 EXECGO_RUNTIME_URL 一致。
// Suggested local split: ExecGo :8080, runtime :18080; must match ExecGo process env.
const DefaultRuntimeBaseURL = "http://127.0.0.1:18080"

// BaseURL 返回去尾斜线的 ExecGo 基址 / returns trimmed ExecGo base URL.
func BaseURL() string {
	return trimBase(os.Getenv(EnvExecGoURL), DefaultExecGoBaseURL)
}

// RuntimeBaseURL 返回去尾斜线的 runtime 基址（供 ensure与文档默认）/ runtime base for probes.
func RuntimeBaseURL() string {
	return trimBase(os.Getenv(EnvRuntimeURL), DefaultRuntimeBaseURL)
}

func trimBase(v, def string) string {
	s := strings.TrimSpace(v)
	if s == "" {
		s = def
	}
	return strings.TrimRight(s, "/")
}
