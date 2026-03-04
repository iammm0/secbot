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

// FunctionCallAgent wraps OpenAI's function calling agent pattern.
// This uses structured tool calling (tool_calls) for reliable tool invocation.
type FunctionCallAgent struct {
	LLM           llms.Model
	Tools         []tools.Tool
	MaxIterations int
	Verbose       bool
	Callbacks     callbacks.Handler
}

// NewFunctionCallAgent creates a new function-calling agent.
func NewFunctionCallAgent(llm llms.Model, toolList []tools.Tool, opts ...FunctionCallOption) *FunctionCallAgent {
	a := &FunctionCallAgent{
		LLM:           llm,
		Tools:         toolList,
		MaxIterations: 5,
	}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

// FunctionCallOption configures the function call agent.
type FunctionCallOption func(*FunctionCallAgent)

// WithMaxIterations sets the maximum number of tool-calling iterations.
func WithMaxIterations(n int) FunctionCallOption {
	return func(a *FunctionCallAgent) { a.MaxIterations = n }
}

// WithVerbose enables verbose output.
func WithVerbose(v bool) FunctionCallOption {
	return func(a *FunctionCallAgent) { a.Verbose = v }
}

// WithCallbacks sets the callback handler.
func WithCallbacks(h callbacks.Handler) FunctionCallOption {
	return func(a *FunctionCallAgent) { a.Callbacks = h }
}

// Run executes the function calling agent with the given input.
func (a *FunctionCallAgent) Run(ctx context.Context, input string) (string, error) {
	agentOpts := []agents.Option{
		agents.WithMaxIterations(a.MaxIterations),
	}
	if a.Callbacks != nil {
		agentOpts = append(agentOpts, agents.WithCallbacksHandler(a.Callbacks))
	}

	agent := agents.NewOpenAIFunctionsAgent(a.LLM, a.Tools, agentOpts...)
	executor := agents.NewExecutor(agent)

	result, err := chains.Run(ctx, executor, input)
	if err != nil {
		return "", fmt.Errorf("function call agent failed: %w", err)
	}
	return result, nil
}

// RunWithIntermediateSteps runs the agent and returns intermediate steps for observability.
func (a *FunctionCallAgent) RunWithIntermediateSteps(ctx context.Context, input string) (map[string]any, error) {
	agentOpts := []agents.Option{
		agents.WithMaxIterations(a.MaxIterations),
		agents.WithReturnIntermediateSteps(),
	}
	if a.Callbacks != nil {
		agentOpts = append(agentOpts, agents.WithCallbacksHandler(a.Callbacks))
	}

	agent := agents.NewOpenAIFunctionsAgent(a.LLM, a.Tools, agentOpts...)
	executor := agents.NewExecutor(agent)

	return chains.Call(ctx, executor, map[string]any{"input": input})
}
