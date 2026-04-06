package utility

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// CveLookupTool 通过 NVD 2.0 REST API 按 CVE ID 或关键词查询漏洞信息。
type CveLookupTool struct{}

func (t *CveLookupTool) Name() string { return "cve_lookup" }

func (t *CveLookupTool) Description() string {
	return "查询 CVE：输入 CVE-2021-44228 形式 ID，或任意关键词（NVD keywordSearch）。使用 services.nvd.nist.gov REST API。"
}

var cveIDRE = regexp.MustCompile(`(?i)^CVE-\d{4}-\d{4,}$`)

func (t *CveLookupTool) Call(ctx context.Context, input string) (string, error) {
	q := strings.TrimSpace(input)
	if q == "" {
		return "", fmt.Errorf("请提供 CVE ID 或关键词")
	}

	base := "https://services.nvd.nist.gov/rest/json/cves/2.0"
	var rawURL string
	if cveIDRE.MatchString(q) {
		rawURL = base + "?cveId=" + url.QueryEscape(strings.ToUpper(q))
	} else {
		rawURL = base + "?keywordSearch=" + url.QueryEscape(q)
	}

	client := &http.Client{Timeout: 45 * time.Second}
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

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncateForOut(string(body))), nil
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

func truncateForOut(s string) string {
	if len(s) > 4000 {
		return s[:4000] + "..."
	}
	return s
}
