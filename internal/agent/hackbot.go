package agent

import (
	"context"
	"fmt"

	"secbot/internal/memory"
	"secbot/internal/patterns"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

// HackbotAgent 是主安全 agent，使用 SecurityReAct 模式执行安全任务
type HackbotAgent struct {
	BaseAgent
	llm   llms.Model
	tools []tools.Tool
	bus   *event.Bus
}

func NewHackbotAgent(llm llms.Model, toolList []tools.Tool, mem *memory.Manager, bus *event.Bus) *HackbotAgent {
	return &HackbotAgent{
		BaseAgent: BaseAgent{
			AgentName: "secbot",
			Memory:    mem,
		},
		llm:   llm,
		tools: toolList,
		bus:   bus,
	}
}

func (h *HackbotAgent) Process(ctx context.Context, input string) (string, error) {
	logger.Infof("[HackbotAgent] 处理请求: %s", truncateStr(input, 100))

	h.bus.EmitSimple(event.AgentThinking, "message", "正在分析安全任务...")

	h.Memory.AddUserMessage(input)

	agent := patterns.NewSecurityReActAgent(h.llm, h.tools, 10)
	result, err := agent.Run(ctx, input)
	if err != nil {
		logger.Errorf("[HackbotAgent] 执行失败: %v", err)
		return "", fmt.Errorf("安全分析执行失败: %w", err)
	}

	h.Memory.AddAssistantMessage(result)

	h.bus.EmitSimple(event.AgentResponse, "message", "安全分析完成")

	return result, nil
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
