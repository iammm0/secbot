package network

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// TracerouteTool 调用系统 traceroute/tracert 显示到目标的路由跳数。
type TracerouteTool struct{}

func (t *TracerouteTool) Name() string { return "traceroute" }
func (t *TracerouteTool) Description() string {
	return "执行系统路由追踪命令（Linux: traceroute/tracepath；Windows: tracert）。输入: 目标主机名或 IP"
}

func (t *TracerouteTool) Call(ctx context.Context, input string) (string, error) {
	host := strings.TrimSpace(input)
	if host == "" {
		return "", fmt.Errorf("请提供目标主机")
	}

	cctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	var (
		name string
		args []string
	)
	switch runtime.GOOS {
	case "windows":
		name = "tracert"
		args = []string{"-d", "-h", "30", host}
	case "darwin":
		name = "traceroute"
		args = []string{"-m", "30", "-n", host}
	default:
		// Linux: 优先 traceroute
		if path, err := exec.LookPath("traceroute"); err == nil && path != "" {
			name = "traceroute"
			args = []string{"-m", "30", "-n", host}
		} else if path, err := exec.LookPath("tracepath"); err == nil && path != "" {
			name = "tracepath"
			args = []string{"-m", "30", host}
		} else {
			return "", fmt.Errorf("未找到 traceroute 或 tracepath，请安装 iputils-tracepath 或 traceroute")
		}
	}

	cmd := exec.CommandContext(cctx, name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	out := strings.TrimSpace(stdout.String())
	if out == "" {
		out = strings.TrimSpace(stderr.String())
	}
	if err != nil && out == "" {
		return "", fmt.Errorf("执行 %s 失败: %w", name, err)
	}
	if out == "" {
		return fmt.Sprintf("命令 %s 无输出", name), nil
	}
	return out, nil
}
