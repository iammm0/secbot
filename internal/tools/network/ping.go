package network

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"
)

type PingTool struct{}

func (t *PingTool) Name() string { return "Ping" }
func (t *PingTool) Description() string {
	return "TCP Ping 检测目标主机是否可达。输入: host 或 host:port"
}

func (t *PingTool) Call(_ context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供目标主机地址")
	}

	host := input
	port := "80"
	if idx := strings.LastIndex(input, ":"); idx > 0 {
		host = input[:idx]
		port = input[idx+1:]
	}

	addr := net.JoinHostPort(host, port)
	results := make([]map[string]any, 0, 4)
	var totalMs float64
	success := 0

	for i := 0; i < 4; i++ {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
		elapsed := time.Since(start)
		ms := float64(elapsed.Microseconds()) / 1000.0

		entry := map[string]any{"seq": i + 1, "time_ms": ms}
		if err != nil {
			entry["status"] = "timeout"
		} else {
			conn.Close()
			entry["status"] = "ok"
			totalMs += ms
			success++
		}
		results = append(results, entry)
	}

	out, _ := json.MarshalIndent(map[string]any{
		"host":       host,
		"port":       port,
		"pings":      results,
		"success":    success,
		"loss_pct":   fmt.Sprintf("%.0f%%", float64(4-success)/4.0*100),
		"avg_ms":     fmt.Sprintf("%.2f", totalMs/max(float64(success), 1)),
	}, "", "  ")
	return string(out), nil
}
