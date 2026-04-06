package control

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// ExecuteCommandTool 在本地直接执行一条 shell 命令（带超时）。
type ExecuteCommandTool struct{}

func (t *ExecuteCommandTool) Name() string { return "execute_command" }

func (t *ExecuteCommandTool) Description() string {
	return "执行 shell 命令（Windows 使用 cmd /C，Unix 使用 sh -c），支持超时。输入为要执行的命令字符串。"
}

func (t *ExecuteCommandTool) Call(ctx context.Context, input string) (string, error) {
	cmdLine := strings.TrimSpace(input)
	if cmdLine == "" {
		return "", fmt.Errorf("请提供命令字符串")
	}

	timeout := 60 * time.Second
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd.exe", "/C", cmdLine)
	} else {
		cmd = exec.CommandContext(ctx, "/bin/sh", "-c", cmdLine)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	elapsed := time.Since(start)

	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = -1
		}
	}

	outStr := stdout.String()
	errStr := stderr.String()
	if len(outStr) > 16000 {
		outStr = outStr[:16000] + "\n... (stdout 已截断)"
	}
	if len(errStr) > 8000 {
		errStr = errStr[:8000] + "\n... (stderr 已截断)"
	}

	res := map[string]any{
		"command":    cmdLine,
		"exit_code":  exitCode,
		"time_ms":    elapsed.Milliseconds(),
		"stdout":     outStr,
		"stderr":     errStr,
		"timed_out":  ctx.Err() == context.DeadlineExceeded,
		"shell":      cmd.Path,
	}
	if err != nil && ctx.Err() == nil {
		res["error"] = err.Error()
	}
	if ctx.Err() != nil && ctx.Err() != context.Canceled {
		res["context_error"] = ctx.Err().Error()
	}

	js, err := json.MarshalIndent(res, "", "  ")
	if err != nil {
		return "", fmt.Errorf("序列化失败: %w", err)
	}
	return string(js), nil
}
