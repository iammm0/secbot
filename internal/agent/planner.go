package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"secbot/internal/memory"
	"secbot/internal/models"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

type PlannerAgent struct {
	BaseAgent
	llm         llms.Model
	tools       []tools.Tool
	bus         *event.Bus
	mu          sync.Mutex
	currentPlan *models.PlanResult
}

func NewPlannerAgent(llm llms.Model, toolList []tools.Tool, mem *memory.Manager, bus *event.Bus) *PlannerAgent {
	return &PlannerAgent{
		BaseAgent: BaseAgent{
			AgentName:     "planner",
			AgentTypeName: "planner",
			Memory:        mem,
		},
		llm:   llm,
		tools: toolList,
		bus:   bus,
	}
}

func (p *PlannerAgent) Plan(ctx context.Context, input string, toolNames []string) (*models.PlanResult, error) {
	logger.Infof("[PlannerAgent] 规划任务: %s", truncateStr(input, 100))

	reqType := p.quickClassify(input)
	if reqType == models.RequestGreeting || reqType == models.RequestSimple {
		resp, err := p.generateQuickResponse(ctx, input)
		if err != nil {
			resp = ""
		}
		return &models.PlanResult{
			RequestType:    reqType,
			DirectResponse: resp,
		}, nil
	}

	result, err := p.planTechnicalTask(ctx, input, toolNames)
	if err != nil {
		return &models.PlanResult{
			RequestType: models.RequestTechnical,
			PlanSummary: fmt.Sprintf("规划失败: %v", err),
		}, nil
	}

	p.mu.Lock()
	p.currentPlan = result
	p.mu.Unlock()

	return result, nil
}

func (p *PlannerAgent) quickClassify(input string) models.RequestType {
	lower := strings.ToLower(input)

	greetings := []string{"你好", "hello", "hi", "嗨", "hey"}
	for _, g := range greetings {
		if strings.Contains(lower, g) && len([]rune(input)) < 20 {
			return models.RequestGreeting
		}
	}

	simplePatterns := []string{"谢谢", "好的", "ok", "thanks", "再见", "bye"}
	for _, sp := range simplePatterns {
		if strings.Contains(lower, sp) && len([]rune(input)) < 15 {
			return models.RequestSimple
		}
	}

	return models.RequestTechnical
}

func (p *PlannerAgent) generateQuickResponse(ctx context.Context, input string) (string, error) {
	prompt := fmt.Sprintf("用简短友好的中文回复: %s", input)
	return llms.GenerateFromSinglePrompt(ctx, p.llm, prompt,
		llms.WithTemperature(0.7),
		llms.WithMaxTokens(200),
	)
}

func (p *PlannerAgent) planTechnicalTask(ctx context.Context, input string, toolNames []string) (*models.PlanResult, error) {
	toolDesc := strings.Join(toolNames, ", ")

	prompt := fmt.Sprintf(`你是安全任务规划器。请将以下安全测试请求拆解为具体的执行步骤。

用户请求: %s

可用工具: %s

以 JSON 格式回复:
{
  "plan_summary": "对任务的一句话描述",
  "todos": [
    {
      "id": "step_1",
      "content": "具体要做什么",
      "tool_hint": "建议使用的工具名",
      "depends_on": [],
      "resource": "目标资源（如 host:192.168.1.1）",
      "risk_level": "low/medium/high",
      "agent_hint": "network_recon/web_pentest/osint/terminal_ops/defense_monitor"
    }
  ],
  "tools_required": ["需要的工具列表"]
}

规则:
- 最多 8 步
- 每步具体可执行
- tool_hint 必须在可用工具列表中
- 仅回复 JSON`, input, toolDesc)

	resp, err := llms.GenerateFromSinglePrompt(ctx, p.llm, prompt,
		llms.WithTemperature(0.1),
		llms.WithMaxTokens(2048),
	)
	if err != nil {
		return nil, fmt.Errorf("生成计划失败: %w", err)
	}

	resp = extractJSON(resp)
	var result models.PlanResult
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		return nil, fmt.Errorf("解析计划 JSON 失败: %w (response: %s)", err, resp)
	}
	result.RequestType = models.RequestTechnical

	for i := range result.Todos {
		if result.Todos[i].Status == "" {
			result.Todos[i].Status = models.TodoPending
		}
	}

	return &result, nil
}

func (p *PlannerAgent) UpdateTodo(todoID string, status models.TodoStatus, resultSummary string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.currentPlan == nil {
		return
	}
	for i := range p.currentPlan.Todos {
		if p.currentPlan.Todos[i].ID == todoID {
			p.currentPlan.Todos[i].Status = status
			if resultSummary != "" {
				p.currentPlan.Todos[i].ResultSummary = resultSummary
			}
			return
		}
	}
}

func (p *PlannerAgent) FindTodoForTool(toolName string) *models.TodoItem {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.currentPlan == nil {
		return nil
	}
	lower := strings.ToLower(toolName)
	for i := range p.currentPlan.Todos {
		if strings.EqualFold(p.currentPlan.Todos[i].ToolHint, lower) &&
			p.currentPlan.Todos[i].Status == models.TodoPending {
			return &p.currentPlan.Todos[i]
		}
	}
	return nil
}

func (p *PlannerAgent) FindNextPendingTodo() *models.TodoItem {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.currentPlan == nil {
		return nil
	}
	for i := range p.currentPlan.Todos {
		if p.currentPlan.Todos[i].Status == models.TodoPending {
			return &p.currentPlan.Todos[i]
		}
	}
	return nil
}

func (p *PlannerAgent) GetExecutionOrder() [][]string {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.currentPlan == nil || len(p.currentPlan.Todos) == 0 {
		return nil
	}

	// 简化拓扑排序：无依赖的放第一层，有依赖的按依赖层级排
	todoMap := make(map[string]*models.TodoItem)
	for i := range p.currentPlan.Todos {
		todoMap[p.currentPlan.Todos[i].ID] = &p.currentPlan.Todos[i]
	}

	placed := make(map[string]bool)
	var layers [][]string

	for len(placed) < len(p.currentPlan.Todos) {
		var layer []string
		for _, todo := range p.currentPlan.Todos {
			if placed[todo.ID] {
				continue
			}
			depsOk := true
			for _, dep := range todo.DependsOn {
				if !placed[dep] {
					depsOk = false
					break
				}
			}
			if depsOk {
				layer = append(layer, todo.ID)
			}
		}
		if len(layer) == 0 {
			for _, todo := range p.currentPlan.Todos {
				if !placed[todo.ID] {
					layer = append(layer, todo.ID)
				}
			}
		}
		for _, id := range layer {
			placed[id] = true
		}
		layers = append(layers, layer)
	}

	return layers
}

func (p *PlannerAgent) Process(ctx context.Context, input string, opts *models.ProcessOptions) (string, error) {
	var toolNames []string
	for _, t := range p.tools {
		toolNames = append(toolNames, t.Name())
	}
	result, err := p.Plan(ctx, input, toolNames)
	if err != nil {
		return "", err
	}
	if result.DirectResponse != "" {
		return result.DirectResponse, nil
	}
	return result.PlanSummary, nil
}

func extractJSON(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}
