package web

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

// DirBruteforceTool 对常见路径进行目录爆破（HEAD/GET）。
type DirBruteforceTool struct{}

func (t *DirBruteforceTool) Name() string { return "dir_bruteforce" }

func (t *DirBruteforceTool) Description() string {
	return "对给定基础 URL 尝试常见敏感路径（如 /admin、/.git），使用 HEAD/GET 并报告状态码。输入: 基础 URL"
}

var dirBruteforcePaths = []string{
	"/", "/admin", "/administrator", "/login", "/wp-admin", "/wp-login.php",
	"/backup", "/backups", "/api", "/api/v1", "/v1", "/config", "/configuration",
	"/.git", "/.git/config", "/.env", "/.svn", "/.DS_Store",
	"/phpmyadmin", "/pma", "/manager/html", "/actuator", "/actuator/env",
	"/server-status", "/debug", "/swagger", "/swagger-ui", "/graphql",
	"/.well-known/security.txt", "/robots.txt", "/sitemap.xml",
}

func normalizeBaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("请提供基础 URL")
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("URL 无效: %w", err)
	}
	if u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("URL 需包含协议与主机")
	}
	u.Path = strings.TrimSuffix(u.Path, "/")
	return u.String(), nil
}

func (t *DirBruteforceTool) Call(ctx context.Context, input string) (string, error) {
	base, err := normalizeBaseURL(input)
	if err != nil {
		return "", err
	}

	client := &http.Client{
		Timeout: 12 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("重定向过多")
			}
			return nil
		},
	}

	type hit struct {
		Path       string `json:"path"`
		Method     string `json:"method"`
		StatusCode int    `json:"status_code"`
		Length     int    `json:"content_length,omitempty"`
	}

	found := make([]hit, 0)
	errList := make([]string, 0)

	doReq := func(method, target string) (int, int, error) {
		req, err := http.NewRequestWithContext(ctx, method, target, nil)
		if err != nil {
			return 0, 0, err
		}
		req.Header.Set("User-Agent", "SecBot-DirBruteforce/1.0")
		resp, err := client.Do(req)
		if err != nil {
			return 0, 0, err
		}
		defer resp.Body.Close()
		n, _ := io.Copy(io.Discard, io.LimitReader(resp.Body, 65536))
		return resp.StatusCode, int(n), nil
	}

	for _, p := range dirBruteforcePaths {
		target := strings.TrimSuffix(base, "/") + p

		code, n, err := doReq(http.MethodHead, target)
		if err != nil {
			errList = append(errList, fmt.Sprintf("HEAD %s: %v", p, err))
		} else if code != http.StatusNotFound && code != http.StatusGone {
			if code == http.StatusMethodNotAllowed {
				code, n, err = doReq(http.MethodGet, target)
				if err != nil {
					errList = append(errList, fmt.Sprintf("GET %s: %v", p, err))
					continue
				}
				if code != http.StatusNotFound && code != http.StatusGone {
					found = append(found, hit{Path: p, Method: http.MethodGet, StatusCode: code, Length: n})
				}
				continue
			}
			found = append(found, hit{Path: p, Method: http.MethodHead, StatusCode: code, Length: n})
			continue
		}

		code, n, err = doReq(http.MethodGet, target)
		if err != nil {
			errList = append(errList, fmt.Sprintf("GET %s: %v", p, err))
			continue
		}
		if code != http.StatusNotFound && code != http.StatusGone {
			found = append(found, hit{Path: p, Method: http.MethodGet, StatusCode: code, Length: n})
		}
	}

	out, _ := json.MarshalIndent(map[string]any{
		"base_url": base,
		"found":    found,
		"errors":   errList,
		"note":     "仅用于授权测试；401/403 也可能表示路径存在。",
	}, "", "  ")
	return string(out), nil
}
