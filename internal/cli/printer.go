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
	bold    = color.New(color.Bold)
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
	iteration, _ := e.Payload["iteration"].(int)
	if iteration == 0 {
		iteration = 1
	}
	fmt.Println()
	dim.Printf("── 推理 (迭代 %d) ──\n", iteration)
}

func (p *EventPrinter) handleThinkChunk(e event.Event) {
	chunk, _ := e.Payload["chunk"].(string)
	if chunk != "" {
		p.currentThought = append(p.currentThought, chunk)
		fmt.Print(chunk)
	}
}

func (p *EventPrinter) handleThinkEnd(e event.Event) {
	thought, _ := e.Payload["thought"].(string)
	if thought != "" && len(p.currentThought) == 0 {
		dim.Println(thought)
	} else if len(p.currentThought) > 0 {
		fmt.Println()
	}
	p.currentThought = nil
}

func (p *EventPrinter) handleExecStart(e event.Event) {
	tool, _ := e.Payload["tool"].(string)
	params, _ := e.Payload["params"].(map[string]any)
	script, _ := e.Payload["script"].(string)

	display := tool
	if script != "" {
		display += "\n" + script
	} else if len(params) > 0 {
		if b, err := json.MarshalIndent(params, "", "  "); err == nil {
			display += "\n" + string(b)
		}
	}
	printPanel("执行", cyan, display)
}

func (p *EventPrinter) handleExecResult(e event.Event) {
	tool, _ := e.Payload["tool"].(string)
	success, _ := e.Payload["success"].(bool)

	if success {
		result, _ := e.Payload["result"].(string)
		if result == "" {
			if r, ok := e.Payload["result"].(map[string]any); ok {
				if b, err := json.MarshalIndent(r, "", "  "); err == nil {
					result = string(b)
				}
			}
		}
		if result != "" {
			if len(result) > 2000 {
				result = result[:2000] + "\n... (已截断)"
			}
			printPanel("✓ "+tool, green, result)
		} else {
			green.Printf("✓ %s 完成\n", tool)
		}
	} else {
		errMsg, _ := e.Payload["error"].(string)
		if errMsg == "" {
			errMsg = "未知错误"
		}
		printPanel("✗ "+tool, red, errMsg)
	}
}

func (p *EventPrinter) handleContent(e event.Event) {
	content, _ := e.Payload["content"].(string)
	if content != "" {
		fmt.Println(content)
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
	red.Printf("错误: %s\n", errMsg)
}

func printPanel(title string, c *color.Color, body string) {
	width := 60
	border := strings.Repeat("─", width)
	c.Printf("┌─ %s %s┐\n", title, border[:max(0, width-len(title)-3)])
	for _, line := range strings.Split(body, "\n") {
		fmt.Printf("│ %s\n", line)
	}
	c.Printf("└%s┘\n", border)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
