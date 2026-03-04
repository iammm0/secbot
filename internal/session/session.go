package session

import (
	"context"
	"fmt"

	"secbot/config"
	"secbot/internal/agent"
	"secbot/internal/llm"
	"secbot/internal/memory"
	"secbot/internal/tools"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
)

// Session 管理一次完整的用户交互会话
type Session struct {
	cfg     *config.Config
	model   llms.Model
	mem     *memory.Manager
	bus     *event.Bus
	router  *agent.IntentRouter
	hackbot *agent.HackbotAgent
	planner *agent.PlannerAgent
	qa      qaAgent
}

type qaAgent struct {
	llm llms.Model
	mem *memory.Manager
}

func (q *qaAgent) answer(ctx context.Context, input string) (string, error) {
	q.mem.AddUserMessage(input)

	messages := q.mem.ToLLMMessages("你是 SecBot，一名专业的安全顾问。用中文回答安全相关问题，给出专业、准确的建议。")
	resp, err := q.llm.GenerateContent(ctx, messages,
		llms.WithTemperature(0.7),
		llms.WithMaxTokens(2048),
	)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("LLM 无响应")
	}

	answer := resp.Choices[0].Content
	q.mem.AddAssistantMessage(answer)
	return answer, nil
}

func NewSession(cfg *config.Config) (*Session, error) {
	model, err := llm.NewLLM(cfg)
	if err != nil {
		return nil, fmt.Errorf("创建 LLM 失败: %w", err)
	}

	mem := memory.NewManager()
	bus := event.NewBus()
	registry := tools.SecurityRegistry()
	toolList := registry.All()

	s := &Session{
		cfg:     cfg,
		model:   model,
		mem:     mem,
		bus:     bus,
		router:  agent.NewIntentRouter(model),
		hackbot: agent.NewHackbotAgent(model, toolList, mem, bus),
		planner: agent.NewPlannerAgent(model, toolList, mem, bus),
		qa:      qaAgent{llm: model, mem: mem},
	}

	bus.On(event.AgentThinking, func(e event.Event) {
		if msg, ok := e.Payload["message"].(string); ok {
			logger.Debugf("[事件] %s", msg)
		}
	})

	return s, nil
}

func (s *Session) Handle(ctx context.Context, input string) (string, error) {
	reqType := s.router.Classify(ctx, input)
	logger.Infof("[Session] 意图: %s", reqType)

	switch reqType {
	case agent.RequestGreeting:
		return s.handleGreeting(ctx, input)
	case agent.RequestTechnical:
		return s.hackbot.Process(ctx, input)
	default:
		return s.qa.answer(ctx, input)
	}
}

func (s *Session) handleGreeting(_ context.Context, _ string) (string, error) {
	return `你好！我是 SecBot —— 你的 AI 安全助手。

我可以帮你：
  - 网络扫描与侦察（端口扫描、DNS 查询、WHOIS）
  - Web 安全检测（HTTP 头分析、SSL 证书检查、技术栈识别）
  - 渗透测试辅助（漏洞扫描、服务探测）
  - 通用工具（哈希计算、编码解码、IP 地理定位）
  - 安全知识问答

输入你的需求开始吧！`, nil
}

func (s *Session) ToolNames() []string {
	return tools.SecurityRegistry().Names()
}

func (s *Session) Bus() *event.Bus { return s.bus }
