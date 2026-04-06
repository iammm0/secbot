package agent

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"secbot/internal/memory"
	"secbot/internal/models"
	"secbot/internal/patterns"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

type CoordinatorAgent struct {
	BaseAgent
	llm            llms.Model
	bus            *event.Bus
	defaultAgent   *HackbotAgent
	specialists    map[string]*SpecialistAgent
	agentResults   map[string][]map[string]any
	mu             sync.Mutex
	concurrencyMu  sync.Mutex
	allToolNames   []string
}

func NewCoordinatorAgent(
	llm llms.Model,
	allTools []tools.Tool,
	mem *memory.Manager,
	bus *event.Bus,
	specialists map[string]*SpecialistAgent,
) *CoordinatorAgent {
	defaultAgent := NewHackbotAgent(llm, allTools, mem, bus)

	names := make([]string, len(allTools))
	for i, t := range allTools {
		names[i] = t.Name()
	}

	return &CoordinatorAgent{
		BaseAgent: BaseAgent{
			AgentName:     "Hackbot",
			AgentTypeName: "secbot-cli",
			Memory:        mem,
		},
		llm:          llm,
		bus:          bus,
		defaultAgent: defaultAgent,
		specialists:  specialists,
		agentResults: make(map[string][]map[string]any),
		allToolNames: names,
	}
}

func (c *CoordinatorAgent) Process(ctx context.Context, input string, opts *models.ProcessOptions) (string, error) {
	c.concurrencyMu.Lock()
	defer c.concurrencyMu.Unlock()
	return c.defaultAgent.Process(ctx, input, opts)
}

func (c *CoordinatorAgent) ExecuteTodo(ctx context.Context, todo models.TodoItem, execCtx map[string]any, opts *models.ProcessOptions) (string, error) {
	c.concurrencyMu.Lock()
	defer c.concurrencyMu.Unlock()

	specialist := c.routeToSpecialist(todo)
	agentType := "secbot-cli"
	if specialist != nil {
		agentType = specialist.AgentType()
	}

	logger.Infof("[Coordinator] 分发 todo %s 到 %s", todo.ID, agentType)

	var result string
	var err error
	if specialist != nil {
		result, err = specialist.Process(ctx, todo.Content, opts)
	} else {
		result, err = c.defaultAgent.Process(ctx, todo.Content, opts)
	}

	if err == nil {
		c.mu.Lock()
		c.agentResults[agentType] = append(c.agentResults[agentType], map[string]any{
			"todo_id": todo.ID,
			"result":  result,
		})
		c.mu.Unlock()
	}

	return result, err
}

func (c *CoordinatorAgent) routeToSpecialist(todo models.TodoItem) *SpecialistAgent {
	if todo.AgentHint != "" {
		if s, ok := c.specialists[todo.AgentHint]; ok {
			return s
		}
	}

	if todo.Resource != "" {
		resource := strings.ToLower(todo.Resource)
		switch {
		case strings.HasPrefix(resource, "host:") || strings.HasPrefix(resource, "subnet:") || strings.HasPrefix(resource, "ip:"):
			if s, ok := c.specialists["network_recon"]; ok {
				return s
			}
		case strings.HasPrefix(resource, "web:") || strings.HasPrefix(resource, "http:") || strings.HasPrefix(resource, "https:"):
			if s, ok := c.specialists["web_pentest"]; ok {
				return s
			}
		case strings.HasPrefix(resource, "domain:") || strings.HasPrefix(resource, "osint:"):
			if s, ok := c.specialists["osint"]; ok {
				return s
			}
		}
	}

	if todo.ToolHint != "" {
		hint := strings.ToLower(todo.ToolHint)
		for agentType, s := range c.specialists {
			for _, tn := range s.ToolNames() {
				if strings.EqualFold(tn, hint) {
					logger.Debugf("[Coordinator] 按 tool_hint %s 路由到 %s", hint, agentType)
					return s
				}
			}
		}
	}

	return nil
}

func (c *CoordinatorAgent) ToolNames() []string {
	return c.allToolNames
}

func (c *CoordinatorAgent) GetAgentResultsByAgent() map[string][]map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	copy := make(map[string][]map[string]any, len(c.agentResults))
	for k, v := range c.agentResults {
		copy[k] = v
	}
	return copy
}

func (c *CoordinatorAgent) ResetAgentResults() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.agentResults = make(map[string][]map[string]any)
}

// SpecialistAgent 专职子 Agent
type SpecialistAgent struct {
	BaseAgent
	llm   llms.Model
	tools []tools.Tool
	bus   *event.Bus
}

func NewSpecialistAgent(name, agentType, systemPrompt string, llm llms.Model, toolList []tools.Tool, mem *memory.Manager, bus *event.Bus) *SpecialistAgent {
	return &SpecialistAgent{
		BaseAgent: BaseAgent{
			AgentName:     name,
			AgentTypeName: agentType,
			SystemPrompt:  systemPrompt,
			Memory:        mem,
		},
		llm:   llm,
		tools: toolList,
		bus:   bus,
	}
}

func (s *SpecialistAgent) Process(ctx context.Context, input string, opts *models.ProcessOptions) (string, error) {
	logger.Infof("[%s] 处理请求: %s", s.AgentTypeName, truncateStr(input, 100))

	if opts != nil && opts.OnEvent != nil {
		opts.OnEvent("thought_start", map[string]any{"iteration": 1, "agent": s.AgentTypeName})
	}

	agent := patterns.NewSecurityReActAgent(s.llm, s.tools, 10)
	if s.SystemPrompt != "" {
		agent.SystemPrompt = s.SystemPrompt
	}

	result, err := agent.Run(ctx, input)
	if err != nil {
		return "", fmt.Errorf("[%s] 执行失败: %w", s.AgentTypeName, err)
	}

	if opts != nil && opts.OnEvent != nil {
		opts.OnEvent("thought_end", map[string]any{"thought": "完成", "iteration": 1, "agent": s.AgentTypeName})
	}

	return result, nil
}

func (s *SpecialistAgent) ToolNames() []string {
	names := make([]string, len(s.tools))
	for i, t := range s.tools {
		names[i] = t.Name()
	}
	return names
}
