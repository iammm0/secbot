package agent

import (
	"context"

	"secbot/internal/memory"
	"secbot/internal/models"
)

type Agent interface {
	Name() string
	AgentType() string
	Process(ctx context.Context, input string, opts *models.ProcessOptions) (string, error)
}

type ExecutableAgent interface {
	Agent
	ExecuteTodo(ctx context.Context, todo models.TodoItem, execCtx map[string]any, opts *models.ProcessOptions) (string, error)
	ToolNames() []string
}

type BaseAgent struct {
	AgentName     string
	AgentTypeName string
	SystemPrompt  string
	Memory        *memory.Manager
}

func (a *BaseAgent) Name() string      { return a.AgentName }
func (a *BaseAgent) AgentType() string  { return a.AgentTypeName }
