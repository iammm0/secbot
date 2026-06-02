package cli

import (
	"encoding/json"
	"fmt"
	"strings"

	"secbot/pkg/event"

	"github.com/fatih/color"
)

var (
	cyan    = color.New(color.FgCyan, color.Bold)
	green   = color.New(color.FgGreen, color.Bold)
	red     = color.New(color.FgRed, color.Bold)
	yellow  = color.New(color.FgYellow, color.Bold)
	magenta = color.New(color.FgMagenta, color.Bold)
	dim     = color.New(color.Faint)
)

type EventPrinter struct {
	currentThought []string
	currentPhase   string
}

func NewEventPrinter() *EventPrinter {
	return &EventPrinter{}
}

func (p *EventPrinter) Handle(e event.Event) {
	switch e.Type {
	case event.PlanStart:
		p.handlePlanStart(e)
	case event.ThinkStart:
		p.handleThinkStart(e)
	case event.ThinkChunk:
		p.handleThinkChunk(e)
	case event.ThinkEnd:
		p.handleThinkEnd(e)
	case event.ExecStart:
		p.handleExecStart(e)
	case event.ExecResult:
		p.handleExecResult(e)
	case event.Content:
		p.handleContent(e)
	case event.ReportEnd:
		p.handleReportEnd(e)
	case event.TaskPhase:
		p.handleTaskPhase(e)
	case event.PlanTodo:
		p.handlePlanTodo(e)
	case event.ErrorOccurred:
		p.handleError(e)
	case event.RootRequired:
		// handled interactively by runner
	}
}

func (p *EventPrinter) handlePlanStart(e event.Event) {
	summary, _ := e.Payload["summary"].(string)
	todos, _ := e.Payload["todos"].([]any)

	var lines []string
	if summary != "" {
		lines = append(lines, summary)
	}
	if len(todos) > 0 {
		lines = append(lines, "")
		for _, t := range todos {
			if tm, ok := t.(map[string]any); ok {
				content, _ := tm["content"].(string)
				status, _ := tm["status"].(string)
				mark := "○"
				switch status {
				case "in_progress":
					mark = "◉"
				case "completed":
					mark = "✓"
				}
				lines = append(lines, fmt.Sprintf("  %s %s", mark, content))
			}
		}
	}

	text := strings.Join(lines, "\n")
	if text == "" {
		text = "规划中..."
	}
	printPanel("规划", magenta, text)
}

func (p *EventPrinter) handleThinkStart(e event.Event) {
	p.currentThought = nil
}

func (p *EventPrinter) handleThinkChunk(e event.Event) {
	chunk, _ := e.Payload["chunk"].(string)
	if chunk != "" {
		p.currentThought = append(p.currentThought, chunk)
	}
}

func (p *EventPrinter) handleThinkEnd(e event.Event) {
	thought, _ := e.Payload["thought"].(string)
	if thought == "" && len(p.currentThought) > 0 {
		thought = strings.Join(p.currentThought, "")
	}
	if strings.TrimSpace(thought) != "" {
		printPanel("推理", yellow, thought)
	}
	p.currentThought = nil
}

func (p *EventPrinter) handleExecStart(e event.Event) {
	tool, _ := e.Payload["tool"].(string)
	params, _ := e.Payload["params"].(map[string]any)
	script, _ := e.Payload["script"].(string)

	printPanel("工具执行", cyan, strings.Join(buildActionLines(tool, "执行中", params, script, nil, ""), "\n\n"))
}

func (p *EventPrinter) handleExecResult(e event.Event) {
	tool, _ := e.Payload["tool"].(string)
	success, _ := e.Payload["success"].(bool)

	if success {
		result := stringifyValue(e.Payload["result"])
		if result != "" {
			if len(result) > 2000 {
				result = result[:2000] + "\n... (已截断)"
			}
			printPanel("工具执行结果", green, strings.Join(buildActionLines(tool, "完成", nil, "", result, ""), "\n\n"))
		} else {
			printPanel("工具执行结果", green, strings.Join(buildActionLines(tool, "完成", nil, "", nil, ""), "\n\n"))
		}
	} else {
		errMsg, _ := e.Payload["error"].(string)
		if errMsg == "" {
			errMsg = "未知错误"
		}
		printPanel("工具执行结果", red, strings.Join(buildActionLines(tool, "失败", nil, "", nil, errMsg), "\n\n"))
	}
}

func (p *EventPrinter) handleContent(e event.Event) {
	content, _ := e.Payload["content"].(string)
	if content != "" {
		viewType, _ := e.Payload["view_type"].(string)
		tool, _ := e.Payload["tool"].(string)
		title, _ := e.Payload["title"].(string)
		c := green
		if tool != "" {
			title = "观察 · " + tool
			c = cyan
		} else if strings.Contains(title, "观察") {
			c = cyan
		} else if title == "" {
			if viewType == "" || viewType == "summary" {
				title = "总结"
			} else {
				title = "内容"
			}
		}
		printPanel(title, c, content)
	}
}

func (p *EventPrinter) handleReportEnd(e event.Event) {
	report, _ := e.Payload["report"].(string)
	if report != "" {
		printPanel("报告", green, report)
	}
}

func (p *EventPrinter) handleTaskPhase(e event.Event) {
	phase, _ := e.Payload["phase"].(string)
	detail, _ := e.Payload["detail"].(string)
	if phase == "" || phase == "done" {
		return
	}
	labels := map[string]string{
		"planning": "规划中",
		"thinking": "推理中",
		"exec":     "执行中",
		"report":   "报告生成中",
	}
	label := labels[phase]
	if label == "" {
		label = phase
	}
	if detail != "" {
		label = label + ": " + detail
	}
	if label != p.currentPhase {
		p.currentPhase = label
		dim.Printf("⟫ %s\n", label)
	}
}

func (p *EventPrinter) handlePlanTodo(e event.Event) {
	todoID, _ := e.Payload["todo_id"].(string)
	status, _ := e.Payload["status"].(string)
	resultSummary, _ := e.Payload["result_summary"].(string)

	mark := "○"
	switch status {
	case "in_progress":
		mark = "◉"
	case "completed":
		mark = "✓"
	}
	msg := fmt.Sprintf("  %s [%s] %s", mark, todoID, status)
	if resultSummary != "" {
		msg += " — " + resultSummary
	}
	dim.Println(msg)
}

func (p *EventPrinter) handleError(e event.Event) {
	errMsg, _ := e.Payload["error"].(string)
	printPanel("错误", red, errMsg)
}

func printPanel(title string, c *color.Color, body string) {
	width := 72
	title = strings.TrimSpace(title)
	if title == "" {
		title = "内容"
	}
	body = strings.TrimSpace(body)
	if body == "" {
		body = " "
	}
	border := strings.Repeat("─", width)
	titleWidth := len([]rune(title))
	c.Printf("╭─ %s %s╮\n", title, strings.Repeat("─", max(0, width-titleWidth-4)))
	for _, line := range strings.Split(body, "\n") {
		fmt.Printf("│ %s\n", line)
	}
	c.Printf("╰%s╯\n", border)
}

func buildActionLines(tool, status string, params map[string]any, script string, result any, errMsg string) []string {
	lines := []string{}
	if tool != "" {
		lines = append(lines, fmt.Sprintf("**工具**: `%s`", tool))
	}
	if status != "" {
		lines = append(lines, fmt.Sprintf("**状态**: %s", status))
	}
	if script != "" {
		lines = append(lines, "**命令**:", fmt.Sprintf("```bash\n%s\n```", script))
	} else if len(params) > 0 {
		lines = append(lines, "**参数**:", fmt.Sprintf("```json\n%s\n```", stringifyValue(params)))
	}
	if errMsg != "" {
		lines = append(lines, fmt.Sprintf("**错误**: %s", errMsg))
	}
	resultText := stringifyValue(result)
	if resultText != "" {
		lines = append(lines, "**输出**:", fmt.Sprintf("```text\n%s\n```", resultText))
	}
	if len(lines) == 0 {
		return []string{" "}
	}
	return lines
}

func stringifyValue(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(v)
	default:
		if b, err := json.MarshalIndent(v, "", "  "); err == nil {
			return string(b)
		}
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
