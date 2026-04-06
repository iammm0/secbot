package defense

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// NetworkAnalyzeTool 展示本机网络连接摘要（netstat 等价信息）。
type NetworkAnalyzeTool struct{}

func (t *NetworkAnalyzeTool) Name() string { return "network_analyze" }

func (t *NetworkAnalyzeTool) Description() string {
	return "分析本机网络连接：输入留空、all 或 listening。基于 netstat 输出进行筛选与汇总。"
}

func (t *NetworkAnalyzeTool) Call(ctx context.Context, input string) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(input))
	if mode == "" {
		mode = "listening"
	}

	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.CommandContext(ctx, "netstat", "-ano")
	default:
		if mode == "listening" {
			cmd = exec.CommandContext(ctx, "netstat", "-an")
		} else {
			cmd = exec.CommandContext(ctx, "netstat", "-an")
		}
	}

	out, err := cmd.CombinedOutput()
	text := strings.ReplaceAll(string(out), "\r\n", "\n")
	if err != nil {
		return "", fmt.Errorf("执行 netstat 失败: %w; 输出: %s", err, truncateStrNet(text, 1200))
	}

	lines := strings.Split(strings.TrimSpace(text), "\n")
	var b strings.Builder
	b.WriteString(fmt.Sprintf("模式: %s\n", mode))
	count := 0
	for _, ln := range lines {
		ln = strings.TrimSpace(ln)
		if ln == "" {
			continue
		}
		low := strings.ToLower(ln)
		switch mode {
		case "listening":
			if strings.Contains(low, "listening") || strings.Contains(low, "listen") {
				b.WriteString(ln)
				b.WriteByte('\n')
				count++
			}
		case "all":
			b.WriteString(ln)
			b.WriteByte('\n')
			count++
		default:
			b.WriteString(ln)
			b.WriteByte('\n')
			count++
		}
		if count >= 200 {
			b.WriteString("... (最多显示 200 行)\n")
			break
		}
	}
	if b.Len() == 0 {
		return "无匹配行（或 netstat 输出格式与筛选不一致）。原始摘要:\n" + truncateStrNet(text, 2000), nil
	}
	return strings.TrimSpace(b.String()), nil
}

func truncateStrNet(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
