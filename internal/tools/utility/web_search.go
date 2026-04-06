package utility

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// WebSearchTool 使用 DuckDuckGo Lite 抓取搜索结果链接与标题片段。
type WebSearchTool struct{}

func (t *WebSearchTool) Name() string { return "web_search" }

func (t *WebSearchTool) Description() string {
	return "通过 DuckDuckGo Lite 网页搜索：输入查询词，解析返回的链接（非官方 API，可能受页面结构变化影响）。"
}

func (t *WebSearchTool) Call(ctx context.Context, input string) (string, error) {
	q := strings.TrimSpace(input)
	if q == "" {
		return "", fmt.Errorf("请提供搜索关键词")
	}

	u := "https://lite.duckduckgo.com/lite/?q=" + url.QueryEscape(q)
	client := &http.Client{Timeout: 20 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; SecBot/1.0; +https://example.local)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Sprintf("HTTP %d", resp.StatusCode), nil
	}

	html := string(body)
	results := parseDDGLite(html)

	var b strings.Builder
	b.WriteString("查询: ")
	b.WriteString(q)
	b.WriteString("\n")
	if len(results) == 0 {
		b.WriteString("未解析到结果（页面结构可能已变或未返回条目）。\n")
		b.WriteString("原始长度: ")
		b.WriteString(fmt.Sprintf("%d 字节\n", len(html)))
		return b.String(), nil
	}
	for i, r := range results {
		if i >= 12 {
			break
		}
		b.WriteString(fmt.Sprintf("%d. %s\n   %s\n", i+1, r.Title, r.URL))
	}
	return b.String(), nil
}

type ddgResult struct {
	Title string
	URL   string
}

var (
	reLinkRow = regexp.MustCompile(`(?s)<a[^>]+href="([^"]+)"[^>]*>([^<]{1,200})</a>`)
	reHTTP    = regexp.MustCompile(`^https?://`)
)

func parseDDGLite(html string) []ddgResult {
	var out []ddgResult
	seen := map[string]bool{}

	for _, m := range reLinkRow.FindAllStringSubmatch(html, -1) {
		if len(m) < 3 {
			continue
		}
		href := strings.TrimSpace(m[1])
		title := strings.TrimSpace(stripTags(m[2]))
		if href == "" || title == "" {
			continue
		}
		if strings.Contains(href, "duckduckgo.com") {
			continue
		}
		if strings.HasPrefix(href, "//") {
			href = "https:" + href
		}
		if !reHTTP.MatchString(href) {
			continue
		}
		if seen[href] {
			continue
		}
		seen[href] = true
		out = append(out, ddgResult{Title: title, URL: href})
		if len(out) >= 15 {
			break
		}
	}
	return out
}

func stripTags(s string) string {
	re := regexp.MustCompile(`<[^>]+>`)
	return strings.TrimSpace(re.ReplaceAllString(s, ""))
}
