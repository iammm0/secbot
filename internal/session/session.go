package session

import (
	"context"
	"fmt"
	"strings"
	"time"

	"secbot/config"
	"secbot/internal/agent"
	"secbot/internal/llm"
	"secbot/internal/memory"
	"secbot/internal/models"
	"secbot/internal/tools"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
)

type Session struct {
	cfg         *config.Config
	model       llms.Model
	mem         *memory.Manager
	bus         *event.Bus
	router      *agent.IntentRouter
	coordinator *agent.CoordinatorAgent
	planner     *agent.PlannerAgent
	summary     *agent.SummaryAgent
	qa          *qaAgent

	currentSession *models.Session
	toolResults    []models.ToolResult
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
	toolMap := registry.Map()

	specialists := agent.CreateSpecialists(model, toolMap, mem, bus)

	s := &Session{
		cfg:         cfg,
		model:       model,
		mem:         mem,
		bus:         bus,
		router:      agent.NewIntentRouter(model),
		coordinator: agent.NewCoordinatorAgent(model, toolList, mem, bus, specialists),
		planner:     agent.NewPlannerAgent(model, toolList, mem, bus),
		summary:     agent.NewSummaryAgent(model, mem),
		qa:          &qaAgent{llm: model, mem: mem},
		currentSession: models.NewSession("secbot-cli"),
	}

	return s, nil
}

func (s *Session) Handle(ctx context.Context, input string) (string, error) {
	return s.HandleWithOptions(ctx, input, nil)
}

func (s *Session) HandleWithOptions(ctx context.Context, input string, opts *models.ProcessOptions) (string, error) {
	if opts == nil {
		opts = &models.ProcessOptions{}
	}

	s.toolResults = nil
	s.currentSession.AddMessage(models.RoleUser, input)

	// 阶段 0: 强制 QA 模式
	if opts.ForceQA {
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "done"})
		response, err := s.qa.answer(ctx, input)
		if err != nil {
			return "", err
		}
		s.currentSession.AddMessage(models.RoleAssistant, response)
		return response, nil
	}

	// 阶段 1: 意图路由
	if !opts.ForceAgentFlow {
		reqType := s.router.Classify(ctx, input)
		logger.Infof("[Session] 意图: %s", reqType)

		switch reqType {
		case models.RequestGreeting:
			resp := s.greetingResponse()
			s.currentSession.AddMessage(models.RoleAssistant, resp)
			return resp, nil
		case models.RequestOther, models.RequestQA:
			s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "done"})
			response, err := s.qa.answer(ctx, input)
			if err != nil {
				return "", err
			}
			s.currentSession.AddMessage(models.RoleAssistant, response)
			return response, nil
		}
	}

	// 阶段 2: 规划
	s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "planning", "detail": ""})

	toolNames := s.getToolNames()
	planResult, err := s.planner.Plan(ctx, input, toolNames)
	if err != nil {
		logger.Errorf("[Session] 规划失败: %v", err)
		planResult = &models.PlanResult{RequestType: models.RequestTechnical}
	}

	if planResult.RequestType == models.RequestGreeting || planResult.RequestType == models.RequestSimple {
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "done"})
		resp := planResult.DirectResponse
		if resp == "" {
			resp = s.greetingResponse()
		}
		s.currentSession.AddMessage(models.RoleAssistant, resp)
		return resp, nil
	}

	// 发射规划事件
	if planResult.RequestType == models.RequestTechnical {
		todoData := make([]any, 0, len(planResult.Todos))
		for _, t := range planResult.Todos {
			todoData = append(todoData, map[string]any{
				"id": t.ID, "content": t.Content, "status": string(t.Status),
				"tool_hint": t.ToolHint, "agent_hint": t.AgentHint,
			})
		}
		s.bus.EmitData(event.PlanStart, map[string]any{
			"summary":        planResult.PlanSummary,
			"todos":          todoData,
			"tools_required": planResult.ToolsRequired,
			"agent":          "planner",
		})
	}

	// 阶段 3: 执行
	agentType := opts.AgentType
	if agentType == "" {
		agentType = "secbot-cli"
	}

	eventBridge := func(eventType string, data map[string]any) {
		if _, ok := data["agent"]; !ok {
			data["agent"] = agentType
		}
		s.bridgeAgentEvent(eventType, data, planResult)
	}

	agentOpts := &models.ProcessOptions{
		OnEvent:      eventBridge,
		SkipPlanning: true,
		SkipReport:   true,
	}

	response, err := s.coordinator.Process(ctx, input, agentOpts)
	if err != nil {
		s.bus.EmitData(event.ErrorOccurred, map[string]any{"error": err.Error()})
		return "", err
	}

	// 阶段 4: 摘要
	s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "report", "detail": "报告生成"})

	summaryResult, err := s.summary.SummarizeInteraction(ctx, input, planResult.Todos, s.toolResults, response)
	if err != nil {
		logger.Warnf("[Session] 摘要失败: %v", err)
	} else if summaryResult != nil {
		s.bus.EmitData(event.ReportEnd, map[string]any{
			"report": summaryResult.RawReport,
			"summary": map[string]any{
				"task_summary":   summaryResult.TaskSummary,
				"key_findings":   summaryResult.KeyFindings,
				"recommendations": summaryResult.Recommendations,
			},
		})
	}

	s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "done"})
	s.currentSession.AddMessage(models.RoleAssistant, response)
	return response, nil
}

func (s *Session) bridgeAgentEvent(eventType string, data map[string]any, planResult *models.PlanResult) {
	agentName, _ := data["agent"].(string)

	switch eventType {
	case "thought_start":
		iteration, _ := data["iteration"].(int)
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "thinking", "detail": "推理中", "agent": agentName})
		s.bus.EmitWithIteration(event.ThinkStart, iteration, map[string]any{"agent": agentName})
	case "thought_chunk":
		iteration, _ := data["iteration"].(int)
		chunk, _ := data["chunk"].(string)
		s.bus.EmitWithIteration(event.ThinkChunk, iteration, map[string]any{"chunk": chunk, "agent": agentName})
	case "thought_end":
		iteration, _ := data["iteration"].(int)
		thought, _ := data["thought"].(string)
		s.bus.EmitWithIteration(event.ThinkEnd, iteration, map[string]any{"thought": thought, "agent": agentName})
	case "action_start":
		tool, _ := data["tool"].(string)
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "exec", "detail": tool, "agent": agentName})
		s.autoUpdateTodo(tool, planResult, models.TodoInProgress, "")
		s.bus.EmitData(event.ExecStart, data)
	case "action_result":
		tool, _ := data["tool"].(string)
		success, _ := data["success"].(bool)
		s.toolResults = append(s.toolResults, models.ToolResult{
			Tool: tool, Success: success,
			Error: fmt.Sprintf("%v", data["error"]),
		})
		status := models.TodoCompleted
		resultText := "成功"
		if !success {
			status = models.TodoPending
			resultText = fmt.Sprintf("失败: %v", data["error"])
		}
		s.autoUpdateTodo(tool, planResult, status, resultText)
		s.bus.EmitData(event.ExecResult, data)
	case "content":
		s.bus.EmitData(event.Content, data)
	case "error":
		s.bus.EmitData(event.ErrorOccurred, data)
	}
}

func (s *Session) autoUpdateTodo(toolName string, planResult *models.PlanResult, status models.TodoStatus, resultSummary string) {
	if planResult == nil {
		return
	}
	matched := s.planner.FindTodoForTool(toolName)
	if matched != nil {
		s.planner.UpdateTodo(matched.ID, status, resultSummary)
		s.bus.EmitData(event.PlanTodo, map[string]any{
			"todo_id": matched.ID, "status": string(status), "result_summary": resultSummary,
		})
		return
	}
	if status == models.TodoInProgress {
		next := s.planner.FindNextPendingTodo()
		if next != nil {
			s.planner.UpdateTodo(next.ID, status, resultSummary)
			s.bus.EmitData(event.PlanTodo, map[string]any{
				"todo_id": next.ID, "status": string(status), "result_summary": resultSummary,
			})
		}
	}
}

func (s *Session) greetingResponse() string {
	return `你好！我是 SecBot —— 你的 AI 安全助手。

我可以帮你：
  - 网络扫描与侦察（端口扫描、DNS 查询、WHOIS）
  - Web 安全检测（HTTP 头分析、SSL 证书检查、技术栈识别）
  - 渗透测试辅助（漏洞扫描、服务探测）
  - 通用工具（哈希计算、编码解码、IP 地理定位）
  - 安全知识问答

输入你的需求开始吧！`
}

func (s *Session) getToolNames() []string {
	return tools.SecurityRegistry().Names()
}

func (s *Session) ToolNames() []string {
	return s.getToolNames()
}

func (s *Session) Bus() *event.Bus { return s.bus }

func (s *Session) ModelInfo() string {
	return fmt.Sprintf("%s (%s)", s.cfg.ModelName, s.cfg.LLMProvider)
}

// unused import guard
var _ = strings.Join
var _ = time.Now
