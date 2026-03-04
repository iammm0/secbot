package tooluse

import (
	"context"
	"fmt"

	"github.com/tmc/langchaingo/agents"
	"github.com/tmc/langchaingo/callbacks"
	"github.com/tmc/langchaingo/chains"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

// ReActAgent implements the Reasoning + Acting (ReAct) agent pattern.
// The agent follows a Thought -> Action -> Observation loop using an LLM
// to decide which tools to use and how to reason about the results.
type ReActAgent struct {
	LLM           llms.Model
	Tools         []tools.Tool
	MaxIterations int
	Callbacks     callbacks.Handler
}

// NewReActAgent creates a new ReAct agent.
func NewReActAgent(llm llms.Model, toolList []tools.Tool, opts ...ReActOption) *ReActAgent {
	a := &ReActAgent{
		LLM:           llm,
		Tools:         toolList,
		MaxIterations: 5,
	}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

// ReActOption configures the ReAct agent.
type ReActOption func(*ReActAgent)

// WithReActMaxIterations sets the maximum iterations for the ReAct loop.
func WithReActMaxIterations(n int) ReActOption {
	return func(a *ReActAgent) { a.MaxIterations = n }
}

// WithReActCallbacks sets the callback handler.
func WithReActCallbacks(h callbacks.Handler) ReActOption {
	return func(a *ReActAgent) { a.Callbacks = h }
}

// Run executes the ReAct agent loop with the given input.
func (a *ReActAgent) Run(ctx context.Context, input string) (string, error) {
	agentOpts := []agents.Option{
		agents.WithMaxIterations(a.MaxIterations),
	}
	if a.Callbacks != nil {
		agentOpts = append(agentOpts, agents.WithCallbacksHandler(a.Callbacks))
	}

	agent := agents.NewOneShotAgent(a.LLM, a.Tools, agentOpts...)
	executor := agents.NewExecutor(agent)

	result, err := chains.Run(ctx, executor, input)
	if err != nil {
		return "", fmt.Errorf("react agent failed: %w", err)
	}
	return result, nil
}

// RunWithIntermediateSteps runs the agent and returns all intermediate reasoning steps.
func (a *ReActAgent) RunWithIntermediateSteps(ctx context.Context, input string) (map[string]any, error) {
	agentOpts := []agents.Option{
		agents.WithMaxIterations(a.MaxIterations),
		agents.WithReturnIntermediateSteps(),
	}
	if a.Callbacks != nil {
		agentOpts = append(agentOpts, agents.WithCallbacksHandler(a.Callbacks))
	}

	agent := agents.NewOneShotAgent(a.LLM, a.Tools, agentOpts...)
	executor := agents.NewExecutor(agent)

	return chains.Call(ctx, executor, map[string]any{"input": input})
}
