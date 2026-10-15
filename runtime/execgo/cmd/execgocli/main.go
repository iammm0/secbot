// Command execgocli 是 Claude Code / Codex 公用的轻量 HTTP 壳：调用 ExecGo 的 /adapters/* 与任务轮询（标准库）。
// A thin stdlib HTTP CLI for /adapters/* and task polling.
// Author: iammm0; Last edited: 2026-04-27
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/iammm0/execgo/internal/execgocli"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "help", "-h", "--help":
		usage()
		return
	case "capabilities", "cap":
		runCapabilities(os.Args[2:])
	case "tools":
		runTools(os.Args[2:])
	case "act":
		runAct(os.Args[2:])
	case "translate":
		runTranslate(os.Args[2:])
	case "wait":
		runWait(os.Args[2:])
	case "cancel":
		runCancel(os.Args[2:])
	case "submit":
		runSubmit(os.Args[2:])
	case "health":
		runHealth(os.Args[2:])
	case "ensure-running":
		runEnsure(os.Args[2:])
	default:
		fmt.Fprintln(os.Stderr, "unknown subcommand:", os.Args[1])
		usage()
		os.Exit(2)
	}
}

func usage() {
	const t = `execgocli — ExecGo 适配器通用 CLI / adapter CLI for agents

环境变量:
  EXECGO_URL              控制面，默认 ` + execgocli.DefaultExecGoBaseURL + `
  EXECGO_RUNTIME_URL      execgo-runtime 基址，默认 ` + execgocli.DefaultRuntimeBaseURL + `（本机与 ExecGo 分端口时与 EXECGO 进程内一致）
  EXECGO_COMPOSE_DIR      含 docker-compose.yml 的 execgo 仓库路径（供 ensure-running 尝试）
  EXECGO_RUNTIME_IMAGE    非空时 ensure-running 可尝试 docker 拉起 runtime
  EXECGO_RUNTIME_SOURCE   execgo-runtime 源码目录（仅用于输出 cargo 引导）

子命令:
  capabilities       GET /adapters/capabilities
  tools              GET /adapters/tools
  act                POST /adapters/actions（JSON 来自 -file 或 stdin）
  translate          POST /adapters/translate
  wait               轮询 GET /tasks/{id} 至终态
  cancel             POST /tasks/{id}/cancel，请求取消任务；可加 --wait 等终态
  submit             POST /tasks（模式 B，直传 TaskGraph JSON）
  health             GET /health
  ensure-running     探活；可选 try docker compose 与 runtime

示例:
  export EXECGO_URL=http://127.0.0.1:8080
  execgocli tools
  echo '{"adapter":"codex","action_id":"a1","action":{"kind":"os.noop","input":{}}}' | execgocli act
  execgocli wait -task-ids a1 -timeout 2m
  execgocli cancel -task-ids a1 --wait
`
	fmt.Fprint(os.Stderr, t)
}

func runCapabilities(args []string) {
	_ = flag.NewFlagSet("capabilities", flag.ContinueOnError)
	_ = parseCommon(nil, args)
	ctx := context.Background()
	c := execgocli.NewClient(execgocli.BaseURL())
	m, b, code, err := c.GetCapabilities(ctx)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error(), StatusCode: code, Body: string(b)})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(m)
}

func runTools(args []string) {
	_ = parseCommon(nil, args)
	ctx := context.Background()
	c := execgocli.NewClient(execgocli.BaseURL())
	m, b, code, err := c.GetTools(ctx)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error(), StatusCode: code, Body: string(b)})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(m)
}

func runAct(args []string) {
	fs := flag.NewFlagSet("act", flag.ExitOnError)
	file := fs.String("file", "", "JSON 文件路径；缺省从 stdin 读 / path to JSON, else stdin")
	_ = parseCommon(fs, args)
	body, err := execgocli.ReadInput(*file, os.Stdin)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: "read input: " + err.Error()})
		os.Exit(1)
	}
	if err := execgocli.ValidateAdapterActionBody(body); err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: "validate input: " + err.Error()})
		os.Exit(1)
	}
	ctx := context.Background()
	c := execgocli.NewClient(execgocli.BaseURL())
	m, b, code, err := c.PostActions(ctx, body)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error(), StatusCode: code, Body: string(b)})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(m)
}

func runTranslate(args []string) {
	fs := flag.NewFlagSet("translate", flag.ExitOnError)
	file := fs.String("file", "", "JSON 文件；缺省 stdin")
	_ = parseCommon(fs, args)
	body, err := execgocli.ReadInput(*file, os.Stdin)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: "read input: " + err.Error()})
		os.Exit(1)
	}
	if err := execgocli.ValidateAdapterActionBody(body); err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: "validate input: " + err.Error()})
		os.Exit(1)
	}
	ctx := context.Background()
	c := execgocli.NewClient(execgocli.BaseURL())
	m, b, code, err := c.PostTranslate(ctx, body)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error(), StatusCode: code, Body: string(b)})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(m)
}

func runSubmit(args []string) {
	fs := flag.NewFlagSet("submit", flag.ExitOnError)
	file := fs.String("file", "", "TaskGraph JSON；缺省 stdin")
	_ = parseCommon(fs, args)
	body, err := execgocli.ReadInput(*file, os.Stdin)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: "read input: " + err.Error()})
		os.Exit(1)
	}
	ctx := context.Background()
	c := execgocli.NewClient(execgocli.BaseURL())
	m, b, code, err := c.PostTasks(ctx, body)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error(), StatusCode: code, Body: string(b)})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(m)
}

func runWait(args []string) {
	fs := flag.NewFlagSet("wait", flag.ExitOnError)
	ids := fs.String("task-ids", "", "逗号分隔任务 id / comma-separated task ids (required)")
	timeout := fs.Duration("timeout", 2*time.Minute, "最长等待 / max wait")
	interval := fs.Duration("interval", 500*time.Millisecond, "轮询间隔 / poll interval")
	_ = parseCommon(fs, args)
	if strings.TrimSpace(*ids) == "" {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: "missing -task-ids"})
		os.Exit(2)
	}
	parts := strings.Split(*ids, ",")
	trimmed := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			trimmed = append(trimmed, s)
		}
	}
	ctx := context.Background()
	c := execgocli.NewClient(execgocli.BaseURL())
	if *timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, *timeout)
		defer cancel()
	}
	out, err := execgocli.Wait(ctx, c, trimmed, *interval, 0)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error()})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(out)
	if !out.AllTerminal {
		os.Exit(3)
	}
}

func runCancel(args []string) {
	fs := flag.NewFlagSet("cancel", flag.ExitOnError)
	ids := fs.String("task-ids", "", "逗号分隔任务 id / comma-separated task ids (required)")
	timeout := fs.Duration("timeout", 30*time.Second, "最长等待取消请求完成 / max wait for cancel requests")
	interval := fs.Duration("interval", 500*time.Millisecond, "启用 --wait 时的轮询间隔 / poll interval when --wait is enabled")
	wait := fs.Bool("wait", false, "取消后等待任务进入终态 / wait until cancelled tasks reach terminal state")
	_ = parseCommon(fs, args)
	if strings.TrimSpace(*ids) == "" {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: "missing -task-ids"})
		os.Exit(2)
	}
	parts := strings.Split(*ids, ",")
	trimmed := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			trimmed = append(trimmed, s)
		}
	}
	ctx := context.Background()
	if *timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, *timeout)
		defer cancel()
	}
	c := execgocli.NewClient(execgocli.BaseURL())
	var out *execgocli.CancelResult
	var err error
	if *wait {
		out, err = execgocli.CancelAndWait(ctx, c, trimmed, *interval)
	} else {
		out, err = execgocli.Cancel(ctx, c, trimmed)
	}
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error()})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(out)
	if *wait && !out.AllTerminal {
		os.Exit(3)
	}
}

func runHealth(args []string) {
	_ = parseCommon(nil, args)
	ctx := context.Background()
	c := execgocli.NewClient(execgocli.BaseURL())
	m, b, code, err := c.GetHealth(ctx)
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error(), StatusCode: code, Body: string(b)})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(m)
}

func runEnsure(args []string) {
	fs := flag.NewFlagSet("ensure-running", flag.ExitOnError)
	withRT := fs.Bool("with-runtime", false, "同时探活/尝试启动 execgo-runtime")
	compose := fs.String("execgo-compose-dir", "", "覆盖 "+execgocli.EnvComposeDir)
	rtImage := fs.String("runtime-image", "", "覆盖 "+execgocli.EnvRuntimeImage)
	rtSrc := fs.String("runtime-source", "", "覆盖 "+execgocli.EnvRuntimeSource)
	_ = parseCommon(fs, args)
	ctx := context.Background()
	res, err := execgocli.EnsureRunning(ctx, execgocli.EnsureOptions{
		WithRuntime:   *withRT,
		ComposeDir:    *compose,
		RuntimeImage:  *rtImage,
		RuntimeSource: *rtSrc,
	})
	if err != nil {
		_ = execgocli.WriteError(execgocli.ErrorValue{Message: err.Error()})
		os.Exit(1)
	}
	_ = execgocli.WriteOK(res)
	if !res.ExecGo.Reachable {
		os.Exit(4)
	}
	if *withRT && (res.Runtime == nil || !res.Runtime.Reachable) {
		os.Exit(5)
	}
}

// parseCommon 预留可扩展的公共 flag（现仅占位）/ placeholder for future global flags.
func parseCommon(fs *flag.FlagSet, args []string) error {
	if fs == nil {
		return nil
	}
	return fs.Parse(args)
}
