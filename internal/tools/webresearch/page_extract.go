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

// PageExtractTool 抓取 URL 对应页面并提取纯文本。
type PageExtractTool struct{}

func (t *PageExtractTool) Name() string { return "page_extract" }

func (t *PageExtractTool) Description() string {
	return "从给定 URL 获取 HTML 并剥离标签得到正文文本。输入为完整 URL。"
}

func (t *PageExtractTool) Call(ctx context.Context, input string) (string, error) {
	raw := strings.TrimSpace(input)
	if raw == "" {
		return "", fmt.Errorf("请提供 URL")
	}
	if !strings.HasPrefix(strings.ToLower(raw), "http://") && !strings.HasPrefix(strings.ToLower(raw), "https://") {
		raw = "https://" + raw
	}

	client := &http.Client{Timeout: 25 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "SecBot-PageExtract/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if err != nil {
		return "", err
	}
	text := stripHTMLToText(string(b))
	if len(text) > 32000 {
		text = text[:32000] + "\n... (已截断)"
	}

	out, _ := json.MarshalIndent(map[string]any{
		"url":         raw,
		"status_code": resp.StatusCode,
		"text":        text,
	}, "", "  ")
	return string(out), nil
}
