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

// DeepCrawlTool 从起始 URL 做 BFS，收集链接与页面文本摘要。
type DeepCrawlTool struct{}

func (t *DeepCrawlTool) Name() string { return "deep_crawl" }

func (t *DeepCrawlTool) Description() string {
	return "广度优先爬取网页。输入 JSON：url（起始地址）、depth（最大深度，>=0）、max_pages（可选，默认 20）。"
}

type deepCrawlReq struct {
	URL      string `json:"url"`
	Depth    int    `json:"depth"`
	MaxPages int    `json:"max_pages"`
}

var reHref = regexp.MustCompile(`(?i)href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'`)

func (t *DeepCrawlTool) Call(ctx context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供 JSON 输入")
	}
	var req deepCrawlReq
	if err := json.Unmarshal([]byte(input), &req); err != nil {
		return "", fmt.Errorf("JSON 解析失败: %w", err)
	}
	start := strings.TrimSpace(req.URL)
	if start == "" {
		return "", fmt.Errorf("需要 url 字段")
	}
	if !strings.HasPrefix(strings.ToLower(start), "http://") && !strings.HasPrefix(strings.ToLower(start), "https://") {
		start = "https://" + start
	}
	if req.Depth < 0 {
		req.Depth = 0
	}
	if req.Depth > 5 {
		req.Depth = 5
	}
	maxPages := req.MaxPages
	if maxPages <= 0 {
		maxPages = 20
	}
	if maxPages > 80 {
		maxPages = 80
	}

	base, err := url.Parse(start)
	if err != nil {
		return "", fmt.Errorf("URL 无效: %w", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	type queueItem struct {
		u     string
		depth int
	}
	q := []queueItem{{u: start, depth: 0}}
	visited := map[string]struct{}{}
	pages := make([]map[string]any, 0, maxPages)

	for len(q) > 0 && len(pages) < maxPages {
		item := q[0]
		q = q[1:]
		if _, ok := visited[item.u]; ok {
			continue
		}
		visited[item.u] = struct{}{}

		reqHTTP, err := http.NewRequestWithContext(ctx, http.MethodGet, item.u, nil)
		if err != nil {
			continue
		}
		reqHTTP.Header.Set("User-Agent", "SecBot-DeepCrawl/1.0")
		resp, err := client.Do(reqHTTP)
		if err != nil {
			pages = append(pages, map[string]any{"url": item.u, "depth": item.depth, "error": err.Error()})
			continue
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
		_ = resp.Body.Close()
		html := string(b)
		summary := stripHTMLToText(html)
		if len(summary) > 500 {
			summary = summary[:500] + "..."
		}
		pages = append(pages, map[string]any{
			"url":         item.u,
			"depth":       item.depth,
			"status_code": resp.StatusCode,
			"summary":     summary,
		})

		if item.depth >= req.Depth {
			continue
		}
		for _, m := range reHref.FindAllStringSubmatch(html, 64) {
			var link string
			if m[1] != "" {
				link = m[1]
			} else {
				link = m[2]
			}
			link = strings.TrimSpace(link)
			if link == "" || strings.HasPrefix(strings.ToLower(link), "javascript:") {
				continue
			}
			abs, err := base.Parse(link)
			if err != nil || abs.Scheme == "" || abs.Host == "" {
				continue
			}
			if abs.Host != base.Host {
				continue
			}
			normalized := abs.String()
			if _, ok := visited[normalized]; !ok {
				q = append(q, queueItem{u: normalized, depth: item.depth + 1})
			}
		}
	}

	out, _ := json.MarshalIndent(map[string]any{
		"start_url": start,
		"max_depth": req.Depth,
		"pages":     pages,
	}, "", "  ")
	return string(out), nil
}
