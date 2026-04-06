package web

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

// CorsCheckTool 使用多种 Origin 头探测 CORS 配置。
type CorsCheckTool struct{}

func (t *CorsCheckTool) Name() string { return "cors_check" }

func (t *CorsCheckTool) Description() string {
	return "对目标 URL 发送带不同 Origin 的请求，检查 Access-Control-Allow-Origin 等 CORS 响应头是否不安全。输入: URL"
}

var corsOrigins = []struct {
	Name   string
	Origin string
}{
	{"evil_https", "https://evil.example"},
	{"evil_http", "http://evil.example"},
	{"null_origin", "null"},
	{"subdomain_wildcard_hint", "https://attacker.target.com"},
	{"same_scheme_different_host", "https://not-the-real-origin.invalid"},
}

func (t *CorsCheckTool) Call(ctx context.Context, input string) (string, error) {
	target, err := normalizeBaseURL(input)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 12 * time.Second}
	tests := make([]map[string]any, 0)

	for _, o := range corsOrigins {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err != nil {
			tests = append(tests, map[string]any{"origin_case": o.Name, "error": err.Error()})
			continue
		}
		req.Header.Set("User-Agent", "SecBot-CORS/1.0")
		req.Header.Set("Origin", o.Origin)

		resp, err := client.Do(req)
		if err != nil {
			tests = append(tests, map[string]any{"origin_case": o.Name, "origin": o.Origin, "error": err.Error()})
			continue
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()

		acao := resp.Header.Get("Access-Control-Allow-Origin")
		acac := resp.Header.Get("Access-Control-Allow-Credentials")
		acam := resp.Header.Get("Access-Control-Allow-Methods")
		acah := resp.Header.Get("Access-Control-Allow-Headers")

		risk := "low"
		switch {
		case acao == "*":
			if strings.EqualFold(acac, "true") {
				risk = "high"
			} else {
				risk = "medium"
			}
		case acao == o.Origin:
			risk = "high"
			if o.Name == "null_origin" {
				risk = "critical"
			}
		case strings.HasPrefix(acao, "http") && acao != "":
			// 反射具体 Origin
			if strings.EqualFold(acac, "true") {
				risk = "high"
			} else {
				risk = "medium"
			}
		}

		tests = append(tests, map[string]any{
			"origin_case":                    o.Name,
			"sent_origin":                   o.Origin,
			"status_code":                   resp.StatusCode,
			"access_control_allow_origin":   acao,
			"access_control_allow_credentials": acac,
			"access_control_allow_methods":  acam,
			"access_control_allow_headers":  acah,
			"heuristic_risk":                risk,
		})
	}

	// 预检请求
	optReq, err := http.NewRequestWithContext(ctx, http.MethodOptions, target, nil)
	if err == nil {
		optReq.Header.Set("Origin", "https://evil.example")
		optReq.Header.Set("Access-Control-Request-Method", "POST")
		optReq.Header.Set("Access-Control-Request-Headers", "Content-Type")
		if resp, err := client.Do(optReq); err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			tests = append(tests, map[string]any{
				"origin_case": "preflight_options",
				"status_code": resp.StatusCode,
				"access_control_allow_origin":   resp.Header.Get("Access-Control-Allow-Origin"),
				"access_control_allow_credentials": resp.Header.Get("Access-Control-Allow-Credentials"),
				"access_control_max_age":        resp.Header.Get("Access-Control-Max-Age"),
			})
		}
	}

	out, _ := json.MarshalIndent(map[string]any{
		"url":   target,
		"tests": tests,
		"note":  "若任意 Origin 得到 ACAO 与请求一致且 ACAC 为 true，可能存在凭证泄露风险。",
	}, "", "  ")
	return string(out), nil
}
