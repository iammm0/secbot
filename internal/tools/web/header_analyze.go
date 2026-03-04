package web

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type HeaderAnalyzeTool struct{}

func (t *HeaderAnalyzeTool) Name() string { return "HeaderAnalyze" }
func (t *HeaderAnalyzeTool) Description() string {
	return "分析 HTTP 响应头中的安全相关头部。输入: URL"
}

var securityHeaders = []string{
	"Strict-Transport-Security",
	"Content-Security-Policy",
	"X-Content-Type-Options",
	"X-Frame-Options",
	"X-XSS-Protection",
	"Referrer-Policy",
	"Permissions-Policy",
	"Cross-Origin-Opener-Policy",
	"Cross-Origin-Resource-Policy",
}

func (t *HeaderAnalyzeTool) Call(ctx context.Context, input string) (string, error) {
	url := strings.TrimSpace(input)
	if url == "" {
		return "", fmt.Errorf("请提供 URL")
	}
	if !strings.HasPrefix(url, "http") {
		url = "https://" + url
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "HEAD", url, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "SecBot/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	present := make([]map[string]string, 0)
	missing := make([]string, 0)

	for _, h := range securityHeaders {
		if v := resp.Header.Get(h); v != "" {
			present = append(present, map[string]string{"header": h, "value": v})
		} else {
			missing = append(missing, h)
		}
	}

	server := resp.Header.Get("Server")
	powered := resp.Header.Get("X-Powered-By")

	score := len(present) * 100 / len(securityHeaders)
	grade := "F"
	switch {
	case score >= 90:
		grade = "A"
	case score >= 70:
		grade = "B"
	case score >= 50:
		grade = "C"
	case score >= 30:
		grade = "D"
	}

	result := map[string]any{
		"url":             url,
		"status":          resp.StatusCode,
		"security_score":  fmt.Sprintf("%d%%", score),
		"grade":           grade,
		"present_headers": present,
		"missing_headers": missing,
	}
	if server != "" {
		result["server_info"] = server
	}
	if powered != "" {
		result["powered_by"] = powered
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}
