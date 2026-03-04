package network

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type HTTPRequestTool struct{}

func (t *HTTPRequestTool) Name() string { return "HTTPRequest" }
func (t *HTTPRequestTool) Description() string {
	return "发送 HTTP 请求并返回响应信息。输入: URL（默认 GET）或 METHOD URL"
}

func (t *HTTPRequestTool) Call(ctx context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供 URL")
	}

	method := "GET"
	url := input
	parts := strings.SplitN(input, " ", 2)
	if len(parts) == 2 {
		m := strings.ToUpper(parts[0])
		if m == "GET" || m == "POST" || m == "HEAD" || m == "PUT" || m == "DELETE" || m == "OPTIONS" {
			method = m
			url = parts[1]
		}
	}

	if !strings.HasPrefix(url, "http") {
		url = "https://" + url
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "SecBot/1.0")

	start := time.Now()
	resp, err := client.Do(req)
	elapsed := time.Since(start)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	headers := make(map[string]string)
	for k, v := range resp.Header {
		headers[k] = strings.Join(v, ", ")
	}

	result := map[string]any{
		"url":         url,
		"method":      method,
		"status_code": resp.StatusCode,
		"status":      resp.Status,
		"time_ms":     fmt.Sprintf("%.0f", float64(elapsed.Milliseconds())),
		"headers":     headers,
		"body_size":   len(body),
	}

	bodyStr := string(body)
	if len(bodyStr) > 2000 {
		bodyStr = bodyStr[:2000] + "... (已截断)"
	}
	result["body_preview"] = bodyStr

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}
