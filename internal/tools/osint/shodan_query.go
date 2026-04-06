package osint

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ShodanQueryTool 通过 Shodan API 查询主机或搜索语法。
type ShodanQueryTool struct{}

func (t *ShodanQueryTool) Name() string { return "shodan_query" }

func (t *ShodanQueryTool) Description() string {
	return "查询 Shodan 公开情报：输入 IPv4/IPv6 地址或 Shodan 搜索语法。需环境变量 SHODAN_API_KEY。"
}

func (t *ShodanQueryTool) Call(ctx context.Context, input string) (string, error) {
	key := strings.TrimSpace(os.Getenv("SHODAN_API_KEY"))
	if key == "" {
		return "", fmt.Errorf("未设置 SHODAN_API_KEY")
	}

	q := strings.TrimSpace(input)
	if q == "" {
		return "", fmt.Errorf("请提供 IP 或 Shodan 查询字符串")
	}

	client := &http.Client{Timeout: 30 * time.Second}

	if ip := net.ParseIP(q); ip != nil {
		base, _ := url.Parse("https://api.shodan.io")
		hostURL := base.JoinPath("shodan", "host", ip.String())
		qs := url.Values{}
		qs.Set("key", key)
		hostURL.RawQuery = qs.Encode()
		return t.doGET(ctx, client, hostURL.String())
	}

	u := fmt.Sprintf("https://api.shodan.io/shodan/host/search?key=%s&query=%s",
		url.QueryEscape(key), url.QueryEscape(q))
	return t.doGET(ctx, client, u)
}

func (t *ShodanQueryTool) doGET(ctx context.Context, client *http.Client, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "SecBot/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
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

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
