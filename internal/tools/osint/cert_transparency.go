package osint

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// CertTransparencyTool 通过 crt.sh 查询证书透明度日志。
type CertTransparencyTool struct{}

func (t *CertTransparencyTool) Name() string { return "cert_transparency" }

func (t *CertTransparencyTool) Description() string {
	return "查询证书透明度（crt.sh）：输入域名，返回相关证书记录（JSON）。"
}

func (t *CertTransparencyTool) Call(ctx context.Context, input string) (string, error) {
	domain := strings.TrimSpace(input)
	if domain == "" {
		return "", fmt.Errorf("请提供域名")
	}

	u := "https://crt.sh/?q=" + url.QueryEscape(domain) + "&output=json"

	client := &http.Client{Timeout: 45 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "SecBot/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncateStr(string(body), 2000)), nil
	}

	var pretty json.RawMessage
	if err := json.Unmarshal(body, &pretty); err != nil {
		return string(body), nil
	}
	out, err := json.MarshalIndent(pretty, "", "  ")
	if err != nil {
		return string(body), nil
	}
	return string(out), nil
}
