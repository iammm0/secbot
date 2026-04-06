package web

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// JwtAnalyzeTool 解码并分析 JWT（无第三方库）。
type JwtAnalyzeTool struct{}

func (t *JwtAnalyzeTool) Name() string { return "jwt_analyze" }

func (t *JwtAnalyzeTool) Description() string {
	return "解码 JWT 的 header 与 payload（Base64URL），检查过期时间与算法风险。输入: JWT 字符串"
}

func decodeJWTPart(seg string) ([]byte, error) {
	seg = strings.TrimSpace(seg)
	if seg == "" {
		return nil, fmt.Errorf("空分段")
	}
	// Base64URL padding
	switch len(seg) % 4 {
	case 2:
		seg += "=="
	case 3:
		seg += "="
	}
	seg = strings.ReplaceAll(seg, "-", "+")
	seg = strings.ReplaceAll(seg, "_", "/")
	return base64.StdEncoding.DecodeString(seg)
}

func (t *JwtAnalyzeTool) Call(ctx context.Context, input string) (string, error) {
	_ = ctx
	token := strings.TrimSpace(input)
	if token == "" {
		return "", fmt.Errorf("请提供 JWT")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", fmt.Errorf("JWT 需为 header.payload.signature 三段")
	}

	hRaw, err := decodeJWTPart(parts[0])
	if err != nil {
		return "", fmt.Errorf("header 解码失败: %w", err)
	}
	pRaw, err := decodeJWTPart(parts[1])
	if err != nil {
		return "", fmt.Errorf("payload 解码失败: %w", err)
	}

	var header map[string]any
	if err := json.Unmarshal(hRaw, &header); err != nil {
		return "", fmt.Errorf("header 非 JSON: %w", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(pRaw, &payload); err != nil {
		return "", fmt.Errorf("payload 非 JSON: %w", err)
	}

	alg, _ := header["alg"].(string)
	typ, _ := header["typ"].(string)
	kid, _ := header["kid"].(string)

	risks := make([]string, 0)
	if strings.EqualFold(alg, "none") {
		risks = append(risks, "alg 为 none，若服务端未拒绝则存在伪造风险")
	}
	if alg != "" && strings.HasPrefix(strings.ToUpper(alg), "HS") {
		risks = append(risks, "对称算法 HS*：若密钥弱或可枚举，存在伪造风险")
	}
	if alg == "RS256" {
		if _, ok := header["jku"]; ok {
			risks = append(risks, "header 含 jku：需确认是否可被劫持用于公钥替换")
		}
	}

	var expNote string
	var expLeft string
	if v, ok := payload["exp"]; ok {
		switch n := v.(type) {
		case float64:
			exp := int64(n)
			expNote = time.Unix(exp, 0).UTC().Format(time.RFC3339)
			now := time.Now().Unix()
			if now > exp {
				expLeft = "已过期"
			} else {
				expLeft = fmt.Sprintf("约 %s 后过期", time.Until(time.Unix(exp, 0)).Round(time.Second))
			}
		default:
			expNote = fmt.Sprintf("%v", v)
		}
	} else {
		risks = append(risks, "无 exp：令牌可能长期有效")
	}

	nbfNote := ""
	if v, ok := payload["nbf"]; ok {
		if n, ok := v.(float64); ok {
			nbfNote = time.Unix(int64(n), 0).UTC().Format(time.RFC3339)
		}
	}

	summary := map[string]any{
		"header": map[string]any{
			"alg": alg,
			"typ": typ,
			"kid": kid,
			"raw": header,
		},
		"payload": map[string]any{
			"claims": payload,
		},
		"timing": map[string]string{
			"exp_utc": expNote,
			"status":  expLeft,
			"nbf_utc": nbfNote,
		},
		"algorithm_notes": map[string]any{
			"alg":  alg,
			"risks": risks,
		},
		"signature": map[string]any{
			"present": len(parts[2]) > 0,
			"note":    "未验证签名；仅做结构与声明分析。",
		},
	}

	out, _ := json.MarshalIndent(summary, "", "  ")
	return string(out), nil
}
