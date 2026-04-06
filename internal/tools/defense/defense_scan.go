package defense

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// DefenseScanTool 对本机做简要安全检查（防火墙状态、监听端口摘要、主机名等）。
type DefenseScanTool struct{}

func (t *DefenseScanTool) Name() string { return "defense_scan" }

func (t *DefenseScanTool) Description() string {
	return "本地安全概览：防火墙状态（Windows netsh / Linux 启发式）、监听端口摘要（netstat）、主机名与工作目录。输入：留空或 full（full 时 netstat 输出更多行）。"
}

func (t *DefenseScanTool) Call(ctx context.Context, input string) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(input))
	full := mode == "full"

	hostname, _ := os.Hostname()
	wd, _ := os.Getwd()

	result := map[string]any{
		"os":       runtime.GOOS,
		"arch":     runtime.GOARCH,
		"hostname": hostname,
		"cwd":      wd,
		"pid":      os.Getpid(),
	}

	result["firewall"] = probeFirewall(ctx)

	lines := 25
	if full {
		lines = 80
	}
	result["netstat_listening_sample"] = runNetstat(ctx, lines)

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func probeFirewall(ctx context.Context) string {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	switch runtime.GOOS {
	case "windows":
		cmd := exec.CommandContext(ctx, "netsh", "advfirewall", "show", "allprofiles", "state")
		out, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Sprintf("无法读取防火墙状态: %v; 输出: %s", err, strings.TrimSpace(string(out)))
		}
		return strings.TrimSpace(string(out))
	case "linux", "darwin", "freebsd":
		// 尝试 ufw / firewalld 是否存在（启发式，非完整检测）
		var hints []string
		if _, err := os.Stat("/usr/sbin/ufw"); err == nil {
			c := exec.CommandContext(ctx, "ufw", "status")
			b, _ := c.CombinedOutput()
			hints = append(hints, "ufw: "+strings.TrimSpace(string(b)))
		}
		if _, err := os.Stat("/usr/bin/firewall-cmd"); err == nil {
			c := exec.CommandContext(ctx, "firewall-cmd", "--state")
			b, _ := c.CombinedOutput()
			hints = append(hints, "firewalld: "+strings.TrimSpace(string(b)))
		}
		if len(hints) == 0 {
			return "未检测到常见防火墙 CLI（ufw/firewall-cmd）；请结合发行版自行确认。"
		}
		return strings.Join(hints, "\n")
	default:
		return "当前平台未实现专用防火墙探测。"
	}
}

func runNetstat(ctx context.Context, maxLines int) string {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.CommandContext(ctx, "netstat", "-ano")
	default:
		cmd = exec.CommandContext(ctx, "netstat", "-an")
	}
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		return fmt.Sprintf("netstat 失败: %v; 输出: %s", err, truncateLines(text, maxLines))
	}
	lines := strings.Split(text, "\n")
	var b strings.Builder
	for i, ln := range lines {
		if i >= maxLines {
			break
		}
		ln = strings.TrimRight(ln, "\r")
		if strings.Contains(strings.ToLower(ln), "listening") || strings.Contains(ln, "LISTEN") || runtime.GOOS != "windows" {
			b.WriteString(ln)
			b.WriteByte('\n')
		}
	}
	if b.Len() == 0 {
		return truncateLines(text, maxLines)
	}
	return strings.TrimSpace(b.String())
}

func truncateLines(s string, n int) string {
	lines := strings.Split(s, "\n")
	if len(lines) <= n {
		return s
	}
	return strings.Join(lines[:n], "\n") + "\n... (截断)"
}
