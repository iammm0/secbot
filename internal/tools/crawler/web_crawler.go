package crawler

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

// WebCrawlerTool 从给定 URL 开始 BFS 爬取站点，最大深度 2。
type WebCrawlerTool struct{}

func (t *WebCrawlerTool) Name() string { return "web_crawler" }

func (t *WebCrawlerTool) Description() string {
	return "爬取网站页面内容与链接，广度优先，最大深度 2。输入为起始 URL。"
}

var (
	reHrefCrawl = regexp.MustCompile(`(?i)href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'`)
	reScriptCr  = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	reStyleCr   = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	reTagsCr    = regexp.MustCompile(`<[^>]+>`)
	reWSCr      = regexp.MustCompile(`\s+`)
)

func stripHTMLText(html string) string {
	s := reScriptCr.ReplaceAllString(html, " ")
	s = reStyleCr.ReplaceAllString(s, " ")
	s = reTagsCr.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = reWSCr.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func (t *WebCrawlerTool) Call(ctx context.Context, input string) (string, error) {
	start := strings.TrimSpace(input)
	if start == "" {
		return "", fmt.Errorf("请提供起始 URL")
	}
	if !strings.HasPrefix(strings.ToLower(start), "http://") && !strings.HasPrefix(strings.ToLower(start), "https://") {
		start = "https://" + start
	}

	base, err := url.Parse(start)
	if err != nil {
		return "", fmt.Errorf("URL 无效: %w", err)
	}

	const maxDepth = 2
	const maxPages = 30

	client := &http.Client{Timeout: 15 * time.Second}
	type qItem struct {
		u     string
		depth int
	}
	q := []qItem{{u: start, depth: 0}}
	visited := map[string]struct{}{}
	pages := make([]map[string]any, 0, maxPages)

	for len(q) > 0 && len(pages) < maxPages {
		it := q[0]
		q = q[1:]
		if _, ok := visited[it.u]; ok {
			continue
		}
		visited[it.u] = struct{}{}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, it.u, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "SecBot-WebCrawler/1.0")
		resp, err := client.Do(req)
		if err != nil {
			pages = append(pages, map[string]any{"url": it.u, "depth": it.depth, "error": err.Error()})
			continue
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
		_ = resp.Body.Close()
		html := string(b)
		text := stripHTMLText(html)
		if len(text) > 4000 {
			text = text[:4000] + "..."
		}
		linksOut := make([]string, 0, 32)
		if it.depth < maxDepth {
			for _, m := range reHrefCrawl.FindAllStringSubmatch(html, 80) {
				link := m[1]
				if link == "" {
					link = m[2]
				}
				link = strings.TrimSpace(link)
				if link == "" || strings.HasPrefix(strings.ToLower(link), "javascript:") {
					continue
				}
				abs, err := base.Parse(link)
				if err != nil || abs.Host == "" {
					continue
				}
				if abs.Host != base.Host {
					continue
				}
				s := abs.String()
				linksOut = append(linksOut, s)
				if _, ok := visited[s]; !ok {
					q = append(q, qItem{u: s, depth: it.depth + 1})
				}
			}
		}
		pages = append(pages, map[string]any{
			"url":         it.u,
			"depth":       it.depth,
			"status_code": resp.StatusCode,
			"content":     text,
			"links_found": linksOut,
		})
	}

	out, _ := json.MarshalIndent(map[string]any{
		"start_url": start,
		"max_depth": maxDepth,
		"pages":     pages,
	}, "", "  ")
	return string(out), nil
}
