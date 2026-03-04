package agent

import (
	"context"

	"secbot/internal/memory"
)

type Agent interface {
	Name() string
	Process(ctx context.Context, input string) (string, error)
}

type BaseAgent struct {
	AgentName    string
	SystemPrompt string
	Memory       *memory.Manager
}

func (a *BaseAgent) Name() string { return a.AgentName }
