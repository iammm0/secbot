package chaining

import (
	"context"
	"fmt"

	"github.com/tmc/langchaingo/chains"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/prompts"
)

// SimpleChain wraps a single LLM call with a prompt template.
type SimpleChain struct {
	LLM      llms.Model
	Template string
	Inputs   []string
}

// NewSimpleChain creates a new single-step LLM chain.
//
// Example template: "Translate the following to {{.language}}: {{.text}}"
// With inputs: ["language", "text"]
func NewSimpleChain(llm llms.Model, template string, inputs []string) *SimpleChain {
	return &SimpleChain{
		LLM:      llm,
		Template: template,
		Inputs:   inputs,
	}
}

// Run executes the chain with a single input value and returns the output string.
// Use this when the chain has exactly one input.
func (s *SimpleChain) Run(ctx context.Context, input string) (string, error) {
	prompt := prompts.NewPromptTemplate(s.Template, s.Inputs)
	chain := chains.NewLLMChain(s.LLM, prompt)
	return chains.Run(ctx, chain, input)
}

// Call executes the chain with multiple named inputs and returns all outputs.
func (s *SimpleChain) Call(ctx context.Context, inputs map[string]any) (map[string]any, error) {
	prompt := prompts.NewPromptTemplate(s.Template, s.Inputs)
	chain := chains.NewLLMChain(s.LLM, prompt)
	return chains.Call(ctx, chain, inputs)
}

// RunWithStreaming executes the chain with streaming output.
func (s *SimpleChain) RunWithStreaming(ctx context.Context, input string, streamFn func(ctx context.Context, chunk []byte) error) (string, error) {
	prompt := prompts.NewPromptTemplate(s.Template, s.Inputs)
	chain := chains.NewLLMChain(s.LLM, prompt)
	result, err := chains.Run(ctx, chain, input, chains.WithStreamingFunc(streamFn))
	if err != nil {
		return "", fmt.Errorf("streaming chain failed: %w", err)
	}
	return result, nil
}
