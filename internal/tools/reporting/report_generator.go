package reporting

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// ReportGeneratorTool 根据 JSON 扫描结果生成 Markdown 安全报告。
type ReportGeneratorTool struct{}

func (t *ReportGeneratorTool) Name() string { return "report_generator" }

func (t *ReportGeneratorTool) Description() string {
	return "根据 JSON 生成 Markdown 安全报告。字段：title、summary、findings（数组，含 severity、title、detail、remediation 等）、metadata（可选）。"
}

type reportInput struct {
	Title    string         `json:"title"`
	Summary  string         `json:"summary"`
	Findings []findingInput `json:"findings"`
	Metadata map[string]any `json:"metadata"`
}

type findingInput struct {
	Severity    string `json:"severity"`
	Title       string `json:"title"`
	Detail      string `json:"detail"`
	Remediation string `json:"remediation"`
	Target      string `json:"target"`
}

func (t *ReportGeneratorTool) Call(_ context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供 JSON 输入")
	}

	var in reportInput
	if err := json.Unmarshal([]byte(input), &in); err != nil {
		return "", fmt.Errorf("JSON 解析失败: %w", err)
	}
	if in.Title == "" {
		in.Title = "安全扫描报告"
	}

	var b strings.Builder
	b.WriteString("# ")
	b.WriteString(escapeMDLine(in.Title))
	b.WriteString("\n\n")
	if in.Summary != "" {
		b.WriteString("## 摘要\n\n")
		b.WriteString(strings.TrimSpace(in.Summary))
		b.WriteString("\n\n")
	}
	if len(in.Metadata) > 0 {
		b.WriteString("## 元数据\n\n")
		for k, v := range in.Metadata {
			b.WriteString(fmt.Sprintf("- **%s**: %v\n", escapeMDLine(k), v))
		}
		b.WriteString("\n")
	}
	b.WriteString("## 发现项\n\n")
	if len(in.Findings) == 0 {
		b.WriteString("_（无）_\n")
	} else {
		for i, f := range in.Findings {
			b.WriteString(fmt.Sprintf("### %d. %s\n\n", i+1, escapeMDLine(nonEmpty(f.Title, "未命名"))))
			if f.Severity != "" {
				b.WriteString(fmt.Sprintf("- **严重程度**: %s\n", escapeMDLine(f.Severity)))
			}
			if f.Target != "" {
				b.WriteString(fmt.Sprintf("- **目标**: %s\n", escapeMDLine(f.Target)))
			}
			if f.Detail != "" {
				b.WriteString("\n")
				b.WriteString(strings.TrimSpace(f.Detail))
				b.WriteString("\n")
			}
			if f.Remediation != "" {
				b.WriteString("\n**修复建议**:\n\n")
				b.WriteString(strings.TrimSpace(f.Remediation))
				b.WriteString("\n")
			}
			b.WriteString("\n---\n\n")
		}
	}
	b.WriteString("\n*报告由 ReportGenerator 工具自动生成。*\n")
	return b.String(), nil
}

func nonEmpty(s, def string) string {
	if strings.TrimSpace(s) == "" {
		return def
	}
	return s
}

func escapeMDLine(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}
