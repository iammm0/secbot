package web

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ParamFuzzerTool 对 URL 查询参数进行 SQLi/XSS/命令注入类 fuzz。
type ParamFuzzerTool struct{}

func (t *ParamFuzzerTool) Name() string { return "param_fuzzer" }

func (t *ParamFuzzerTool) Description() string {
	return "解析带查询参数的 URL，对每个参数依次注入 SQLi/XSS/命令类 payload，比较响应状态与摘要。输入: 含参数的 URL"
}

var fuzzPayloads = []struct {
	Category string
	Value    string
}{
	{"sqli", "' OR '1'='1"},
	{"sqli", "1' AND SLEEP(0)--"},
	{"sqli", "1; SELECT 1"},
	{"xss", "<svg onload=alert(1)>"},
	{"xss", "\"><img src=x onerror=alert(1)>"},
	{"cmd", "| id"},
	{"cmd", "; cat /etc/passwd"},
	{"cmd", "$(whoami)"},
}

func (t *ParamFuzzerTool) Call(ctx context.Context, input string) (string, error) {
	raw := strings.TrimSpace(input)
	if raw == "" {
		return "", fmt.Errorf("请提供带查询参数的 URL")
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("URL 解析失败: %w", err)
	}
	if u.RawQuery == "" {
		return "", fmt.Errorf("URL 需包含查询参数（如 ?id=1）")
	}

	q := u.Query()
	params := make([]string, 0, len(q))
	for k := range q {
		params = append(params, k)
	}
	if len(params) == 0 {
		return "", fmt.Errorf("未找到查询参数名")
	}

	client := &http.Client{Timeout: 12 * time.Second}
	baseline := map[string]int{}
	baseBodyHash := map[string]int{}

	baseURL := *u
	baseURL.RawQuery = q.Encode()
	br, err := fetchBrief(ctx, client, baseURL.String())
	if err == nil {
		for _, p := range params {
			baseline[p] = br.status
			baseBodyHash[p] = br.bodyLen
		}
	}

	results := make([]map[string]any, 0)

	for _, param := range params {
		orig := q.Get(param)
		for _, fp := range fuzzPayloads {
			q2 := u.Query()
			q2.Set(param, fp.Value)
			u2 := *u
			u2.RawQuery = q2.Encode()
			fr, err := fetchBrief(ctx, client, u2.String())
			entry := map[string]any{
				"param":       param,
				"original":    orig,
				"category":    fp.Category,
				"payload":     fp.Value,
				"fuzzed_url":  u2.String(),
				"status_code": fr.status,
				"body_len":    fr.bodyLen,
				"error":       nil,
			}
			if err != nil {
				entry["error"] = err.Error()
			} else {
				delta := ""
				if b, ok := baseline[param]; ok && fr.status != b {
					delta = fmt.Sprintf("状态码由 %d 变为 %d", b, fr.status)
				}
				if bh, ok := baseBodyHash[param]; ok && fr.bodyLen != bh && fr.bodyLen > 0 {
					if delta != "" {
						delta += "; "
					}
					delta += fmt.Sprintf("正文长度由 %d 变为 %d", bh, fr.bodyLen)
				}
				if delta == "" {
					delta = "与基线相比无明显变化（仍可能存在盲注/过滤）"
				}
				entry["observation"] = delta
			}
			results = append(results, entry)
		}
	}

	out, _ := json.MarshalIndent(map[string]any{
		"base_url": u.Scheme + "://" + u.Host + u.Path,
		"results":  results,
		"note":     "仅启发式差异检测；需结合授权范围与人工确认。",
	}, "", "  ")
	return string(out), nil
}
