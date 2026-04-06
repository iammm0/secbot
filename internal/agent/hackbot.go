package agent

import (
	"context"
	"fmt"

	"secbot/internal/memory"
	"secbot/internal/models"
	"secbot/internal/patterns"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

type HackbotAgent struct {
	BaseAgent
	llm   llms.Model
	tools []tools.Tool
	bus   *event.Bus
}

func NewHackbotAgent(llm llms.Model, toolList []tools.Tool, mem *memory.Manager, bus *event.Bus) *HackbotAgent {
	return &HackbotAgent{
		BaseAgent: BaseAgent{
			AgentName:     "Hackbot",
			AgentTypeName: "secbot-cli",
			Memory:        mem,
		},
		llm:   llm,
		tools: toolList,
		bus:   bus,
	}
}

func (h *HackbotAgent) Process(ctx context.Context, input string, opts *models.ProcessOptions) (string, error) {
	logger.Infof("[HackbotAgent] 处理请求: %s", truncateStr(input, 100))

	h.bus.EmitSimple(event.AgentThinking, "message", "正在分析安全任务...")

	if opts != nil && opts.OnEvent != nil {
		opts.OnEvent("thought_start", map[string]any{"iteration": 1, "agent": h.AgentTypeName})
	}

	h.Memory.AddUserMessage(input)

	agent := patterns.NewSecurityReActAgent(h.llm, h.tools, 10)
	result, err := agent.Run(ctx, input)
	if err != nil {
		logger.Errorf("[HackbotAgent] 执行失败: %v", err)
		return "", fmt.Errorf("安全分析执行失败: %w", err)
	}

	h.Memory.AddAssistantMessage(result)

	if opts != nil && opts.OnEvent != nil {
		opts.OnEvent("thought_end", map[string]any{"thought": "分析完成", "iteration": 1, "agent": h.AgentTypeName})
	}

	h.bus.EmitSimple(event.AgentResponse, "message", "安全分析完成")

	return result, nil
}

func (h *HackbotAgent) ToolNames() []string {
	names := make([]string, len(h.tools))
	for i, t := range h.tools {
		names[i] = t.Name()
	}
	return names
}

func truncateStr(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "..."
}
