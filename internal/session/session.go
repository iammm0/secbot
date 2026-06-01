package session

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"secbot/config"
	"secbot/internal/agent"
	"secbot/internal/contextmgr"
	"secbot/internal/database"
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
	db          *database.Manager
	bus         *event.Bus
	router      *agent.IntentRouter
	explore     *agent.ExploreAgent
	coordinator *agent.CoordinatorAgent
	planner     *agent.PlannerAgent
	summary     *agent.SummaryAgent
	qa          *qaAgent
	contextAsm  *contextmgr.Assembler

	currentSession *models.Session
	toolResults    []models.ToolResult
}

type qaAgent struct {
	llm llms.Model
	mem *memory.Manager
}

func (q *qaAgent) answer(ctx context.Context, input, contextBlock string) (string, error) {
	q.mem.AddUserMessage(input)

	messages := q.mem.ToLLMMessages("你是 SecBot，一名专业的安全顾问。用中文回答安全相关问题，给出专业、准确的建议。")
	if strings.TrimSpace(contextBlock) != "" {
		messages = append(messages, llms.TextParts(
			llms.ChatMessageTypeHuman,
			fmt.Sprintf("以下是当前会话检索上下文，请结合它回答当前问题，不要编造未出现的事实：\n\n%s", contextBlock),
		))
	}
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
	db, dbErr := database.NewManager(cfg.DatabaseURL)
	if dbErr != nil {
		logger.Warnf("[Session] 初始化 SQLite 数据库失败，继续使用内存上下文: %v", dbErr)
	}
	bus := event.NewBus()
	registry := tools.SecurityRegistry()
	toolList := registry.All()
	toolMap := registry.Map()

	specialists := agent.CreateSpecialists(model, toolMap, mem, bus)

	s := &Session{
		cfg:            cfg,
		model:          model,
		mem:            mem,
		db:             db,
		bus:            bus,
		router:         agent.NewIntentRouter(model),
		explore:        agent.NewExploreAgent(model, toolMap),
		coordinator:    agent.NewCoordinatorAgent(model, toolList, mem, bus, specialists),
		planner:        agent.NewPlannerAgent(model, toolList, mem, bus),
		summary:        agent.NewSummaryAgent(model, mem),
		qa:             &qaAgent{llm: model, mem: mem},
		contextAsm:     contextmgr.NewAssembler(mem, db),
		currentSession: models.NewSession("secbot-cli"),
	}

	return s, nil
}

func (s *Session) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Session) SubscribeEvents(handler event.Handler) func() {
	if s == nil || s.bus == nil {
		return func() {}
	}
	return s.bus.SubscribeAll(handler)
}

func (s *Session) SetSessionID(sessionID, agentType string) {
	if s == nil || s.currentSession == nil {
		return
	}
	if strings.TrimSpace(sessionID) != "" {
		s.currentSession.ID = strings.TrimSpace(sessionID)
	}
	if strings.TrimSpace(agentType) != "" {
		s.currentSession.AgentType = strings.TrimSpace(agentType)
	}
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
	sessionID := s.currentSession.ID
	if strings.TrimSpace(sessionID) == "" {
		sessionID = "default"
	}

	// 阶段 0: 强制 QA 模式
	if opts.ForceQA {
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "done"})
		assembledContext := s.contextAsm.Build(input, s.currentSession, sessionID, "qa", s.cfg.ModelName)
		s.emitContextUsage(assembledContext.Debug)
		response, err := s.qa.answer(ctx, input, assembledContext.ContextBlock)
		if err != nil {
			return "", err
		}
		s.currentSession.AddMessage(models.RoleAssistant, response)
		s.contextAsm.RememberTurn(sessionID, "qa", input, response)
		return response, nil
	}

	// 阶段 1: 意图路由（与 TS ChatService 的 IntentDecision 对齐）
	s.contextAsm.UpdateFocusFromInput(sessionID, input)
	intent := s.router.ClassifyDecision(
		ctx,
		input,
		s.contextAsm.Focus(sessionID),
		s.contextAsm.Unresolved(sessionID),
	)
	if opts.ForceAgentFlow && intent.Intent == models.IntentSmallTalk {
		intent.Intent = models.IntentQA
		intent.NeedsReport = false
		intent.Rationale = strings.TrimSpace(intent.Rationale + " (forceAgent)")
	}
	s.contextAsm.MergeIntentFocus(sessionID, intent.Focus)
	logger.Infof("[Session] 意图: %s", intent.Intent)
	s.bus.EmitData(event.IntentDecision, map[string]any{
		"intent":        string(intent.Intent),
		"confidence":    intent.Confidence,
		"needs_explore": intent.NeedsExplore,
		"needs_report":  intent.NeedsReport,
		"focus":         intent.Focus,
		"rationale":     intent.Rationale,
	})

	if !opts.ForceAgentFlow {
		switch intent.Intent {
		case models.IntentSmallTalk:
			resp := intent.DirectResponse
			if strings.TrimSpace(resp) == "" {
				resp = "收到～有需要执行的安全任务随时说。"
			}
			s.bus.EmitData(event.Content, map[string]any{"content": resp, "agent": "small_talk"})
			s.currentSession.AddMessage(models.RoleAssistant, resp)
			s.contextAsm.RememberTurn(sessionID, "small_talk", input, resp)
			return resp, nil
		case models.IntentMeta:
			resp := intent.DirectResponse
			if strings.TrimSpace(resp) == "" {
				resp = "我会尽量帮你查清楚。"
			}
			s.bus.EmitData(event.Content, map[string]any{"content": resp, "agent": "meta"})
			s.currentSession.AddMessage(models.RoleAssistant, resp)
			s.contextAsm.RememberTurn(sessionID, "meta", input, resp)
			return resp, nil
		case models.IntentQA:
			s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "done"})
			if strings.TrimSpace(intent.DirectResponse) != "" {
				s.currentSession.AddMessage(models.RoleAssistant, intent.DirectResponse)
				s.contextAsm.RememberTurn(sessionID, "qa", input, intent.DirectResponse)
				return intent.DirectResponse, nil
			}
			assembledContext := s.contextAsm.Build(input, s.currentSession, sessionID, "qa", s.cfg.ModelName)
			s.emitContextUsage(assembledContext.Debug)
			response, err := s.qa.answer(ctx, input, assembledContext.ContextBlock)
			if err != nil {
				return "", err
			}
			s.currentSession.AddMessage(models.RoleAssistant, response)
			s.contextAsm.RememberTurn(sessionID, "qa", input, response)
			return response, nil
		case models.IntentClarifyNeeded:
			question := intent.ClarifyQuestion
			if strings.TrimSpace(question) == "" {
				question = "我需要确认几个关键点：目标是什么？你期望的范围/产出是什么？是否已获得授权？"
			}
			s.bus.EmitData(event.Clarify, map[string]any{"question": question})
			s.currentSession.AddMessage(models.RoleAssistant, question)
			s.contextAsm.RememberTurn(sessionID, "router", input, question)
			return question, nil
		}
	}

	if intent.NeedsExplore {
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "exploring", "detail": "正在收集上下文…"})
		s.bus.EmitData(event.ExploreStart, map[string]any{
			"focus":     intent.Focus,
			"userInput": input,
		})
		exploreResult := s.explore.Explore(ctx, input, intent, "")
		for _, step := range exploreResult.Steps {
			s.bus.EmitData(event.ExploreStep, map[string]any{
				"iteration":   step.Iteration,
				"kind":        step.Kind,
				"tool":        step.Tool,
				"observation": step.Observation,
				"thought":     step.Thought,
				"agent":       "explore",
			})
		}
		s.contextAsm.ApplyPatch(sessionID, exploreResult.Patch)
		s.bus.EmitData(event.ExploreEnd, map[string]any{
			"facts_count": len(exploreResult.Patch.Facts),
			"unresolved":  exploreResult.Patch.Unresolved,
			"summary":     exploreResult.Patch.ExploreSummary,
		})
		s.bus.EmitData(event.ContextPatch, map[string]any{
			"facts_count": len(exploreResult.Patch.Facts),
			"pinned":      len(exploreResult.Patch.Pinned),
			"unresolved":  exploreResult.Patch.Unresolved,
			"summary":     exploreResult.Patch.ExploreSummary,
		})
	}

	agentTypeForContext := opts.AgentType
	if agentTypeForContext == "" {
		agentTypeForContext = "secbot-cli"
	}
	assembledContext := s.contextAsm.Build(input, s.currentSession, sessionID, agentTypeForContext, s.cfg.ModelName)
	s.emitContextUsage(assembledContext.Debug)
	contextBlock := assembledContext.ContextBlock

	if intent.Intent == models.IntentTaskSimple {
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "executing", "detail": "正在执行任务..."})
		agentType := opts.AgentType
		if agentType == "" {
			agentType = "secbot-cli"
		}
		response, err := s.coordinator.Process(ctx, input, &models.ProcessOptions{
			OnEvent: func(eventType string, data map[string]any) {
				if _, ok := data["agent"]; !ok {
					data["agent"] = agentType
				}
				s.bridgeAgentEvent(eventType, data, &models.PlanResult{RequestType: models.RequestTechnical})
			},
			SkipPlanning:    true,
			SkipReport:      true,
			AgentType:       agentType,
			GetRootPassword: opts.GetRootPassword,
			ContextBlock:    contextBlock,
		})
		if err != nil {
			s.bus.EmitData(event.ErrorOccurred, map[string]any{"error": err.Error()})
			return "", err
		}
		s.currentSession.AddMessage(models.RoleAssistant, response)
		s.contextAsm.RememberTurn(sessionID, agentType, input, response)
		return response, nil
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
		s.contextAsm.RememberTurn(sessionID, "planner", input, resp)
		return resp, nil
	}

	if planResult.DirectResponse != "" {
		s.bus.EmitData(event.Content, map[string]any{"content": planResult.DirectResponse, "agent": "planner"})
		s.currentSession.AddMessage(models.RoleAssistant, planResult.DirectResponse)
		s.contextAsm.RememberTurn(sessionID, "planner", input, planResult.DirectResponse)
		return planResult.DirectResponse, nil
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
		ContextBlock: contextBlock,
	}

	var response string
	cancelledCount := 0
	if len(planResult.Todos) > 1 {
		executor := NewTaskExecutor(s.coordinator, s.planner, s.bus, contextBlock)
		execResult, err := executor.Run(ctx, input, planResult, eventBridge)
		if err != nil {
			s.bus.EmitData(event.ErrorOccurred, map[string]any{"error": err.Error()})
			return "", err
		}
		response = execResult.Summary
		cancelledCount = execResult.CancelledCount
	} else {
		var err error
		response, err = s.coordinator.Process(ctx, input, agentOpts)
		if err != nil {
			s.bus.EmitData(event.ErrorOccurred, map[string]any{"error": err.Error()})
			return "", err
		}
	}

	if !adaptiveReplanOff() && cancelledCount > 0 {
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "planning", "detail": "穿插规划：根据未成功子任务补充方案…"})
		adaptivePrompt := fmt.Sprintf("%s\n\n【穿插规划】上一阶段有 %d 个子任务未成功。请仅输出需要补充执行的新子任务 JSON 数组（新 id 建议 followup-1、followup-2）；若无须补充则输出 []。\n\n阶段摘要（节选）：\n%s", input, cancelledCount, truncateText(response, 4000))
		subPlan, err := s.planner.Plan(ctx, adaptivePrompt, toolNames)
		if err == nil && subPlan != nil && len(subPlan.Todos) > 0 && subPlan.DirectResponse == "" {
			s.emitPlanning(subPlan, "adaptive")
			s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "executing", "detail": "执行穿插任务…"})
			followUpExecutor := NewTaskExecutor(s.coordinator, s.planner, s.bus, contextBlock)
			followUpResult, runErr := followUpExecutor.Run(ctx, input, subPlan, eventBridge)
			if runErr == nil && strings.TrimSpace(followUpResult.Summary) != "" {
				if strings.TrimSpace(response) != "" {
					response += "\n"
				}
				response += followUpResult.Summary
			}
			planResult.Todos = append(planResult.Todos, subPlan.Todos...)
		}
	}

	// 阶段 4: 摘要
	if intent.NeedsReport && intent.Intent != models.IntentTaskSimple {
		s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "report", "detail": "报告生成"})

		summaryResult, err := s.summary.SummarizeInteraction(ctx, input, planResult.Todos, s.toolResults, response)
		if err != nil {
			logger.Warnf("[Session] 摘要失败: %v", err)
		} else if summaryResult != nil {
			s.bus.EmitData(event.ReportEnd, map[string]any{
				"report": summaryResult.RawReport,
				"summary": map[string]any{
					"task_summary":    summaryResult.TaskSummary,
					"key_findings":    summaryResult.KeyFindings,
					"recommendations": summaryResult.Recommendations,
				},
			})
			if strings.TrimSpace(summaryResult.OverallConclusion) != "" {
				response = summaryResult.OverallConclusion
			}
		}
	}

	s.bus.EmitData(event.TaskPhase, map[string]any{"phase": "done"})
	s.currentSession.AddMessage(models.RoleAssistant, response)
	s.contextAsm.RememberTurn(sessionID, agentType, input, response)
	return response, nil
}

func (s *Session) emitContextUsage(debug contextmgr.DebugMeta) {
	ratio := 0.0
	if debug.PromptBudget > 0 {
		ratio = float64(debug.UsedTokens) / float64(debug.PromptBudget)
		if ratio < 0 {
			ratio = 0
		}
		if ratio > 1 {
			ratio = 1
		}
	}
	s.bus.EmitData(event.ContextUsage, map[string]any{
		"model":           debug.ModelName,
		"context_window":  debug.ContextWindow,
		"prompt_budget":   debug.PromptBudget,
		"used_tokens":     debug.UsedTokens,
		"reserved_tokens": debug.ReservedTokens,
		"ratio":           ratio,
		"focus":           debug.Focus,
		"pinned":          debug.Pinned,
		"sqlite_turns":    debug.SQLiteTurns,
		"vector_hits":     debug.VectorHits,
		"memory_lines":    debug.MemoryLines,
	})
}

func (s *Session) emitPlanning(planResult *models.PlanResult, scope string) {
	todoData := make([]any, 0, len(planResult.Todos))
	for _, t := range planResult.Todos {
		todoData = append(todoData, map[string]any{
			"id":         t.ID,
			"content":    t.Content,
			"status":     string(t.Status),
			"depends_on": t.DependsOn,
			"tool_hint":  t.ToolHint,
			"resource":   t.Resource,
			"risk_level": t.RiskLevel,
			"agent_hint": t.AgentHint,
		})
	}
	s.bus.EmitData(event.PlanStart, map[string]any{
		"summary":        planResult.PlanSummary,
		"scope":          scope,
		"todos":          todoData,
		"tools_required": planResult.ToolsRequired,
		"agent":          "planner",
	})
}

func adaptiveReplanOff() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SECBOT_ADAPTIVE_REPLAN")))
	return v == "0" || v == "false"
}

func truncateText(text string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= maxRunes {
		return text
	}
	return string(runes[:maxRunes])
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
