package webresearch

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

// SmartSearchTool 使用 DuckDuckGo HTML 接口搜索并抓取若干条结果的页面正文摘要。
type SmartSearchTool struct{}

func (t *SmartSearchTool) Name() string { return "smart_search" }

func (t *SmartSearchTool) Description() string {
	return "通过 DuckDuckGo 网页搜索，抓取前若干条结果并提取正文摘要。输入为搜索关键词。"
}

var (
	reDDGLink = regexp.MustCompile(`class="result__a"[^>]*href="([^"]+)"`)
	reScript  = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	reStyle   = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	reTags    = regexp.MustCompile(`<[^>]+>`)
	reWS      = regexp.MustCompile(`\s+`)
)

func stripHTMLToText(html string) string {
	s := reScript.ReplaceAllString(html, " ")
	s = reStyle.ReplaceAllString(s, " ")
	s = reTags.ReplaceAllString(s, " ")
	s = htmlEntityDecode(s)
	s = reWS.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func htmlEntityDecode(s string) string {
	repl := []struct{ from, to string }{
		{"&nbsp;", " "},
		{"&lt;", "<"},
		{"&gt;", ">"},
		{"&amp;", "&"},
		{"&quot;", "\""},
		{"&#39;", "'"},
	}
	for _, r := range repl {
		s = strings.ReplaceAll(s, r.from, r.to)
	}
	return s
}

func (t *SmartSearchTool) Call(ctx context.Context, input string) (string, error) {
	q := strings.TrimSpace(input)
	if q == "" {
		return "", fmt.Errorf("请提供搜索关键词")
	}

	client := &http.Client{Timeout: 20 * time.Second}
	searchURL := "https://html.duckduckgo.com/html/?q=" + url.QueryEscape(q)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "SecBot-SmartSearch/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("搜索请求失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return "", err
	}
	page := string(body)
	links := reDDGLink.FindAllStringSubmatch(page, 8)
	urls := make([]string, 0, len(links))
	seen := map[string]struct{}{}
	for _, m := range links {
		if len(m) < 2 {
			continue
		}
		u := strings.TrimSpace(m[1])
		if u == "" {
			continue
		}
		if _, ok := seen[u]; ok {
			continue
		}
		seen[u] = struct{}{}
		urls = append(urls, u)
		if len(urls) >= 5 {
			break
		}
	}

	results := make([]map[string]any, 0, len(urls))
	for _, u := range urls {
		text, fetchErr := fetchPageText(ctx, client, u)
		item := map[string]any{"url": u, "text_preview": text}
		if fetchErr != nil {
			item["error"] = fetchErr.Error()
		}
		results = append(results, item)
	}

	out, _ := json.MarshalIndent(map[string]any{
		"query":   q,
		"results": results,
	}, "", "  ")
	return string(out), nil
}

func fetchPageText(ctx context.Context, client *http.Client, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "SecBot-SmartSearch/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return "", err
	}
	text := stripHTMLToText(string(b))
	if len(text) > 1200 {
		text = text[:1200] + "..."
	}
	return text, nil
}
