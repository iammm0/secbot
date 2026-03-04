package agent

import (
	"context"
	"fmt"

	"secbot/internal/memory"

	"github.com/tmc/langchaingo/llms"
)

// SummaryAgent 生成对话摘要
type SummaryAgent struct {
	BaseAgent
	llm llms.Model
}

func NewSummaryAgent(llm llms.Model, mem *memory.Manager) *SummaryAgent {
	return &SummaryAgent{
		BaseAgent: BaseAgent{
			AgentName: "summary",
			Memory:    mem,
		},
		llm: llm,
	}
}

func (s *SummaryAgent) Process(ctx context.Context, _ string) (string, error) {
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
