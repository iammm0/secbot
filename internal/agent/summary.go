package agent

import (
	"context"
	"fmt"
	"strings"

	"secbot/internal/memory"
	"secbot/internal/models"

	"github.com/tmc/langchaingo/llms"
)

type SummaryAgent struct {
	BaseAgent
	llm llms.Model
}

func NewSummaryAgent(llm llms.Model, mem *memory.Manager) *SummaryAgent {
	return &SummaryAgent{
		BaseAgent: BaseAgent{
			AgentName:     "summary",
			AgentTypeName: "summary",
			Memory:        mem,
		},
		llm: llm,
	}
}

func (s *SummaryAgent) SummarizeInteraction(
	ctx context.Context,
	userInput string,
	todos []models.TodoItem,
	toolResults []models.ToolResult,
	agentResponse string,
) (*models.InteractionSummary, error) {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("用户请求: %s\n\n", userInput))

	if len(todos) > 0 {
		sb.WriteString("执行步骤:\n")
		for _, t := range todos {
			sb.WriteString(fmt.Sprintf("- [%s] %s (%s)\n", t.ID, t.Content, t.Status))
			if t.ResultSummary != "" {
				sb.WriteString(fmt.Sprintf("  结果: %s\n", t.ResultSummary))
			}
		}
		sb.WriteString("\n")
	}

	if len(toolResults) > 0 {
		sb.WriteString("工具执行结果:\n")
		for _, tr := range toolResults {
			if tr.Success {
				sb.WriteString(fmt.Sprintf("- ✓ %s\n", tr.Tool))
			} else {
				sb.WriteString(fmt.Sprintf("- ✗ %s: %s\n", tr.Tool, tr.Error))
			}
		}
		sb.WriteString("\n")
	}

	if agentResponse != "" {
		sb.WriteString("Agent 响应:\n")
		sb.WriteString(truncateStr(agentResponse, 2000))
		sb.WriteString("\n")
	}

	prompt := fmt.Sprintf(`请根据以下安全测试交互信息生成简洁的中文总结报告。

%s

要求:
- 用 Markdown 格式
- 包含: 任务摘要、关键发现、风险评估、建议
- 简洁专业，300字以内`, sb.String())

	resp, err := llms.GenerateFromSinglePrompt(ctx, s.llm, prompt,
		llms.WithTemperature(0.3),
		llms.WithMaxTokens(1000),
	)
	if err != nil {
		return nil, fmt.Errorf("生成报告失败: %w", err)
	}

	return &models.InteractionSummary{
		RawReport:   resp,
		TaskSummary: fmt.Sprintf("针对「%s」的安全测试任务", truncateStr(userInput, 50)),
	}, nil
}

func (s *SummaryAgent) Process(ctx context.Context, input string, opts *models.ProcessOptions) (string, error) {
	history := s.Memory.GetContextSummary()
	if history == "" {
		return "暂无对话历史。", nil
	}

	prompt := fmt.Sprintf(`请简洁总结以下对话内容的关键信息:

%s

要求:
- 提炼关键操作和发现
- 突出安全相关的重要结论
- 200字以内`, history)

	resp, err := llms.GenerateFromSinglePrompt(ctx, s.llm, prompt,
		llms.WithTemperature(0.3),
		llms.WithMaxTokens(500),
	)
	if err != nil {
		return "", fmt.Errorf("生成摘要失败: %w", err)
	}
	return resp, nil
}
