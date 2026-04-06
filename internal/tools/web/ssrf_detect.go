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

// SsrfDetectTool 在参数中注入内网与元数据 URL 探针。
type SsrfDetectTool struct{}

func (t *SsrfDetectTool) Name() string { return "ssrf_detect" }

func (t *SsrfDetectTool) Description() string {
	return "对带参数的 URL 各查询参数注入内网/本地/云元数据地址，根据响应差异做 SSRF 启发式检测。输入: URL（建议含参数）"
}

var ssrfProbes = []struct {
	Name  string
	Value string
}{
	{"loopback_http", "http://127.0.0.1/"},
	{"loopback_alt", "http://127.1/"},
	{"ipv6_loopback", "http://[::1]/"},
	{"private_10", "http://10.0.0.1/"},
	{"private_192", "http://192.168.0.1/"},
	{"link_local", "http://169.254.169.254/latest/meta-data/"},
	{"file_proto", "file:///etc/passwd"},
	{"gopher_stub", "gopher://127.0.0.1:70/"},
}

func (t *SsrfDetectTool) Call(ctx context.Context, input string) (string, error) {
	raw := strings.TrimSpace(input)
	if raw == "" {
		return "", fmt.Errorf("请提供 URL")
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("URL 解析失败: %w", err)
	}

	client := &http.Client{
		Timeout: 12 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 4 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	// 基线：无注入
	var base briefResp
	if u.RawQuery != "" {
		base, _ = fetchBrief(ctx, client, u.String())
	}

	params := []string{}
	if u.RawQuery != "" {
		q := u.Query()
		for k := range q {
			params = append(params, k)
		}
	}
	if len(params) == 0 {
		// 无参数时，附加常见参数名进行探测
		params = []string{"url", "uri", "path", "dest", "redirect", "next", "target", "r", "u"}
	}

	results := make([]map[string]any, 0)

	for _, param := range params {
		for _, probe := range ssrfProbes {
			u2 := *u
			q := u2.Query()
			q.Set(param, probe.Value)
			u2.RawQuery = q.Encode()
			fr, err := fetchBrief(ctx, client, u2.String())
			m := map[string]any{
				"param":         param,
				"probe":         probe.Name,
				"injected":      probe.Value,
				"request_url":   u2.String(),
				"status_code":   fr.status,
				"body_len":      fr.bodyLen,
				"error":         nil,
				"heuristic_note": "",
			}
			if err != nil {
				m["error"] = err.Error()
			} else {
				note := "与基线相比无显著差异或无法判断"
				if base.status != 0 {
					if fr.status != base.status {
						note = fmt.Sprintf("状态码与基线不同: 基线=%d, 当前=%d", base.status, fr.status)
					} else if fr.bodyLen > 0 && base.bodyLen > 0 && abs(fr.bodyLen-base.bodyLen) > 50 {
						note = fmt.Sprintf("正文长度变化较大: 基线=%d, 当前=%d", base.bodyLen, fr.bodyLen)
					}
				} else if fr.status == 200 && fr.bodyLen > 100 {
					note = "无基线时返回 200 且有一定正文，需人工判断是否带出内网数据"
				}
				m["heuristic_note"] = note
			}
			results = append(results, m)
		}
	}

	out, _ := json.MarshalIndent(map[string]any{
		"url":          u.String(),
		"baseline":     map[string]any{"status": base.status, "body_len": base.bodyLen},
		"observations": results,
		"note":         "启发式检测；确认 SSRF 需结合回显、DNS 带外或内网靶标。",
	}, "", "  ")
	return string(out), nil
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
