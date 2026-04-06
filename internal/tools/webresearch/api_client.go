package webresearch

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ApiClientTool 通用 REST HTTP 客户端。
type ApiClientTool struct{}

func (t *ApiClientTool) Name() string { return "api_client" }

func (t *ApiClientTool) Description() string {
	return "发送 HTTP 请求。输入 JSON：url、method（GET/POST 等）、headers（对象）、body（字符串，可选）、timeout_seconds（可选）。"
}

type apiReq struct {
	URL             string            `json:"url"`
	Method          string            `json:"method"`
	Headers         map[string]string `json:"headers"`
	Body            string            `json:"body"`
	TimeoutSeconds  int               `json:"timeout_seconds"`
	MaxResponseBody int               `json:"max_response_body"`
}

func (t *ApiClientTool) Call(ctx context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供 JSON 输入")
	}
	var ar apiReq
	if err := json.Unmarshal([]byte(input), &ar); err != nil {
		return "", fmt.Errorf("JSON 解析失败: %w", err)
	}
	if strings.TrimSpace(ar.URL) == "" {
		return "", fmt.Errorf("需要 url")
	}
	method := strings.ToUpper(strings.TrimSpace(ar.Method))
	if method == "" {
		method = http.MethodGet
	}
	timeout := 30 * time.Second
	if ar.TimeoutSeconds > 0 {
		timeout = time.Duration(ar.TimeoutSeconds) * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var bodyReader io.Reader
	if ar.Body != "" {
		bodyReader = strings.NewReader(ar.Body)
	}
	req, err := http.NewRequestWithContext(ctx, method, ar.URL, bodyReader)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	for k, v := range ar.Headers {
		req.Header.Set(k, v)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "SecBot-ApiClient/1.0")
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		out, _ := json.MarshalIndent(map[string]any{
			"url":   ar.URL,
			"error": err.Error(),
		}, "", "  ")
		return string(out), nil
	}
	defer resp.Body.Close()

	max := ar.MaxResponseBody
	if max <= 0 {
		max = 512 * 1024
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, int64(max)))
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}
	preview := string(raw)
	if len(preview) > 16000 {
		preview = preview[:16000] + "\n... (已截断)"
	}

	respHeaders := map[string]string{}
	for k, v := range resp.Header {
		respHeaders[k] = strings.Join(v, ", ")
	}

	out, _ := json.MarshalIndent(map[string]any{
		"url":          ar.URL,
		"method":       method,
		"status_code":  resp.StatusCode,
		"status":       resp.Status,
		"headers":      respHeaders,
		"body_preview": preview,
		"body_bytes":   len(raw),
	}, "", "  ")
	return string(out), nil
}
