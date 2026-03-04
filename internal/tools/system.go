package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type SystemCommandTool struct{}

func (t *SystemCommandTool) Name() string { return "SystemCommand" }
func (t *SystemCommandTool) Description() string {
	return "在本机执行系统命令并返回输出。输入: 要执行的命令"
}

func (t *SystemCommandTool) Call(ctx context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供要执行的命令")
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/c", input)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", input)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	output := stdout.String()
	if stderr.Len() > 0 {
		output += "\n[STDERR]\n" + stderr.String()
	}

	if err != nil {
		output += fmt.Sprintf("\n[EXIT] %s", err)
	}

	if len(output) > 8000 {
		output = output[:8000] + "\n... (输出已截断)"
	}

	return output, nil
}
