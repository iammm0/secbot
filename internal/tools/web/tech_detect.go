package web

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type TechDetectTool struct{}

func (t *TechDetectTool) Name() string { return "TechDetect" }
func (t *TechDetectTool) Description() string {
	return "检测目标网站使用的技术栈（Web 服务器、框架、CMS 等）。输入: URL"
}

func (t *TechDetectTool) Call(ctx context.Context, input string) (string, error) {
	url := strings.TrimSpace(input)
	if url == "" {
		return "", fmt.Errorf("请提供 URL")
	}
	if !strings.HasPrefix(url, "http") {
		url = "https://" + url
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; SecBot/1.0)")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 65536))
	bodyStr := strings.ToLower(string(body))

	techs := make([]string, 0)

	if s := resp.Header.Get("Server"); s != "" {
		techs = append(techs, "Server: "+s)
	}
	if p := resp.Header.Get("X-Powered-By"); p != "" {
		techs = append(techs, "Powered-By: "+p)
	}

	signatures := map[string]string{
		"wp-content":        "WordPress",
		"wp-includes":       "WordPress",
		"joomla":            "Joomla",
		"drupal":            "Drupal",
		"next/static":       "Next.js",
		"__next":            "Next.js",
		"nuxt":              "Nuxt.js",
		"react":             "React",
		"vue":               "Vue.js",
		"angular":           "Angular",
		"jquery":            "jQuery",
		"bootstrap":         "Bootstrap",
		"tailwindcss":       "Tailwind CSS",
		"laravel":           "Laravel",
		"django":            "Django",
		"flask":             "Flask",
		"express":           "Express.js",
		"asp.net":           "ASP.NET",
		"cloudflare":        "Cloudflare",
		"nginx":             "Nginx",
		"apache":            "Apache",
	}

	detected := make(map[string]bool)
	for sig, tech := range signatures {
		if strings.Contains(bodyStr, sig) && !detected[tech] {
			detected[tech] = true
			techs = append(techs, tech)
		}
	}

	for _, cookie := range resp.Cookies() {
		name := strings.ToLower(cookie.Name)
		if strings.Contains(name, "phpsessid") {
			techs = append(techs, "PHP")
		} else if strings.Contains(name, "asp.net") || strings.Contains(name, "aspsessionid") {
			techs = append(techs, "ASP.NET")
		} else if strings.Contains(name, "jsessionid") {
			techs = append(techs, "Java")
		}
	}

	result := map[string]any{
		"url":          url,
		"technologies": techs,
		"total":        len(techs),
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}
