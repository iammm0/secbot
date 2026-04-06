package cloud

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// S3BucketEnumTool 通过 HTTP GET 探测 S3 桶虚拟主机是否可访问（公开列目录等场景的粗检）。
type S3BucketEnumTool struct{}

func (t *S3BucketEnumTool) Name() string { return "s3_bucket_enum" }

func (t *S3BucketEnumTool) Description() string {
	return "检查 S3 桶虚拟主机端点是否可 HTTP 访问。输入：桶名称（bucket name）。"
}

func (t *S3BucketEnumTool) Call(ctx context.Context, input string) (string, error) {
	bucket := strings.TrimSpace(input)
	if bucket == "" {
		return "", fmt.Errorf("请提供 S3 桶名称")
	}
	if strings.ContainsAny(bucket, "/\\") {
		return "", fmt.Errorf("桶名称不合法")
	}

	url := fmt.Sprintf("https://%s.s3.amazonaws.com/", bucket)
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "SecBot-S3Check/1.0")

	resp, err := client.Do(req)
	if err != nil {
		out, _ := json.MarshalIndent(map[string]any{
			"bucket":     bucket,
			"url":        url,
			"reachable":  false,
			"error":      err.Error(),
		}, "", "  ")
		return string(out), nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	preview := string(body)
	if len(preview) > 2000 {
		preview = preview[:2000] + "... (已截断)"
	}

	// 常见：200 可能含 ListBucketResult；403 存在但拒绝匿名；404 桶不存在或拒绝
	publicHint := resp.StatusCode == http.StatusOK ||
		(resp.StatusCode == http.StatusForbidden && strings.Contains(strings.ToLower(preview), "accessdenied"))

	out, _ := json.MarshalIndent(map[string]any{
		"bucket":           bucket,
		"url":              url,
		"status_code":      resp.StatusCode,
		"reachable":        true,
		"public_list_hint": publicHint,
		"body_preview":     preview,
	}, "", "  ")
	return string(out), nil
}
