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

// ArpScanTool 通过系统 ARP/邻居表命令查看局域网解析条目（需系统支持）。
type ArpScanTool struct{}

func (t *ArpScanTool) Name() string { return "arp_scan" }
func (t *ArpScanTool) Description() string {
	return "调用系统命令查看 ARP 缓存或邻居表（Windows: arp；Linux: ip neigh / arp）。输入可选: 网卡名（如 eth0）或留空查看全部"
}

func (t *ArpScanTool) Call(ctx context.Context, input string) (string, error) {
	arg := strings.TrimSpace(input)

	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var (
		name string
		args []string
	)
	switch runtime.GOOS {
	case "windows":
		name = "arp"
		if arg != "" {
			args = []string{"-a", "-N", arg}
		} else {
			args = []string{"-a"}
		}
	default:
		// Linux: 优先 ip neigh
		if path, err := exec.LookPath("ip"); err == nil && path != "" {
			name = "ip"
			if arg != "" {
				args = []string{"neigh", "show", "dev", arg}
			} else {
				args = []string{"neigh", "show"}
			}
		} else {
			name = "arp"
			if arg != "" {
				args = []string{"-an", "-i", arg}
			} else {
				args = []string{"-an"}
			}
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
		return "无 ARP/邻居表输出（可能无权限或接口不存在）", nil
	}
	return out, nil
}
