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
	"regexp"
	"strings"
	"time"
)

// VirusTotalTool 调用 VirusTotal v3 API 查询 IP、域名或文件哈希。
type VirusTotalTool struct{}

func (t *VirusTotalTool) Name() string { return "virustotal" }

func (t *VirusTotalTool) Description() string {
	return "查询 VirusTotal：输入域名、IP 或文件哈希（MD5/SHA1/SHA256）。需环境变量 VIRUSTOTAL_API_KEY。"
}

var hashRE = regexp.MustCompile(`(?i)^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$`)

func (t *VirusTotalTool) Call(ctx context.Context, input string) (string, error) {
	apiKey := strings.TrimSpace(os.Getenv("VIRUSTOTAL_API_KEY"))
	if apiKey == "" {
		return "", fmt.Errorf("未设置 VIRUSTOTAL_API_KEY")
	}

	raw := strings.TrimSpace(input)
	if raw == "" {
		return "", fmt.Errorf("请提供域名、IP 或哈希")
	}

	var endpoint string
	switch {
	case net.ParseIP(raw) != nil:
		endpoint = "https://www.virustotal.com/api/v3/ip_addresses/" + url.PathEscape(raw)
	case hashRE.MatchString(raw):
		endpoint = "https://www.virustotal.com/api/v3/files/" + url.PathEscape(strings.ToLower(raw))
	default:
		endpoint = "https://www.virustotal.com/api/v3/domains/" + url.PathEscape(strings.ToLower(raw))
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("x-apikey", apiKey)
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
		return fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncateStr(string(body), 4000)), nil
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
