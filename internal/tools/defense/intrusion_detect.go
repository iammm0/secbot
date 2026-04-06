package defense

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// IntrusionDetectTool 基于进程列表与网络连接的启发式入侵迹象检查。
type IntrusionDetectTool struct{}

func (t *IntrusionDetectTool) Name() string { return "intrusion_detect" }

func (t *IntrusionDetectTool) Description() string {
	return "启发式检查：枚举进程（tasklist/ps）、监听端口、匹配可疑关键字；非杀毒引擎，需人工研判。输入可留空。"
}

func (t *IntrusionDetectTool) Call(ctx context.Context, _ string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	findings := []map[string]string{}

	procOut := listProcesses(ctx)
	if procOut != "" {
		for _, kw := range []string{"mimikatz", "powershell -enc", "certutil -urlcache", "net user", "whoami"} {
			if strings.Contains(strings.ToLower(procOut), strings.ToLower(kw)) {
				findings = append(findings, map[string]string{
					"type":     "suspicious_keyword_in_process_list",
					"detail":   "匹配关键字: " + kw,
					"severity": "medium",
				})
			}
		}
	}

	netOut := runNetstatAll(ctx)
	if netOut != "" {
		lines := strings.Split(netOut, "\n")
		listeners := 0
		for _, ln := range lines {
			if strings.Contains(strings.ToLower(ln), "listening") || strings.Contains(ln, "LISTEN") {
				listeners++
			}
		}
		if listeners > 80 {
			findings = append(findings, map[string]string{
				"type":     "many_listeners",
				"detail":   fmt.Sprintf("检测到大量监听端口行: %d（需结合业务判断）", listeners),
				"severity": "low",
			})
		}
	}

	result := map[string]any{
		"os":           runtime.GOOS,
		"findings":     findings,
		"process_head": headLines(procOut, 15),
		"netstat_head": headLines(netOut, 15),
		"disclaimer":   "此为本地启发式检查，不能替代 EDR/AV；无发现不代表系统安全。",
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func listProcesses(ctx context.Context) string {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.CommandContext(ctx, "tasklist")
	default:
		cmd = exec.CommandContext(ctx, "ps", "aux")
	}
	b, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Sprintf("error: %v\n%s", err, string(b))
	}
	return string(b)
}

func runNetstatAll(ctx context.Context) string {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "netstat", "-ano")
	} else {
		cmd = exec.CommandContext(ctx, "netstat", "-an")
	}
	b, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Sprintf("error: %v\n%s", err, string(b))
	}
	return string(b)
}

func headLines(s string, n int) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(s, "\n")
	if len(lines) <= n {
		return s
	}
	return strings.Join(lines[:n], "\n") + "\n..."
}
