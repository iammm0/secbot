package patterns

import (
	"context"
	"fmt"

	"github.com/tmc/langchaingo/agents"
	"github.com/tmc/langchaingo/chains"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

// ReActAgent 实现 Reasoning + Acting 循环模式
type ReActAgent struct {
	LLM           llms.Model
	Tools         []tools.Tool
	MaxIterations int
}

func NewReActAgent(llm llms.Model, toolList []tools.Tool, maxIter int) *ReActAgent {
	if maxIter <= 0 {
		maxIter = 8
	}
	return &ReActAgent{
		LLM:           llm,
		Tools:         toolList,
		MaxIterations: maxIter,
	}
}

func (a *ReActAgent) Run(ctx context.Context, input string) (string, error) {
	agent := agents.NewOneShotAgent(a.LLM, a.Tools,
		agents.WithMaxIterations(a.MaxIterations),
	)
	executor := agents.NewExecutor(agent)

	result, err := chains.Run(ctx, executor, input)
	if err != nil {
		return "", fmt.Errorf("ReAct 循环执行失败: %w", err)
	}
	return result, nil
}

func (a *ReActAgent) RunWithSteps(ctx context.Context, input string) (map[string]any, error) {
	agent := agents.NewOneShotAgent(a.LLM, a.Tools,
		agents.WithMaxIterations(a.MaxIterations),
		agents.WithReturnIntermediateSteps(),
	)
	executor := agents.NewExecutor(agent)

	return chains.Call(ctx, executor, map[string]any{"input": input})
}
