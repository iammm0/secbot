package chaining

import (
	"context"
	"fmt"

	"github.com/tmc/langchaingo/chains"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/prompts"
)

// Step defines one stage in a sequential pipeline.
type Step struct {
	Name      string   // Human-readable step name
	Template  string   // Prompt template (Go template syntax)
	Inputs    []string // Input variable names
	OutputKey string   // Key for this step's output
}

// SequentialPipeline chains multiple LLM calls in sequence.
// Each step's output feeds into the next step's input.
type SequentialPipeline struct {
	LLM   llms.Model
	Steps []Step
}

// NewSequentialPipeline creates a new multi-step sequential chain.
func NewSequentialPipeline(llm llms.Model, steps []Step) *SequentialPipeline {
	return &SequentialPipeline{
		LLM:   llm,
		Steps: steps,
	}
}

// Run executes all steps in sequence and returns the final output and all intermediate results.
func (p *SequentialPipeline) Run(ctx context.Context, inputs map[string]any) (map[string]any, error) {
	if len(p.Steps) == 0 {
		return nil, fmt.Errorf("pipeline has no steps")
	}

	// Build the chain objects
	llmChains := make([]chains.Chain, 0, len(p.Steps))
	allInputKeys := make([]string, 0)
	finalOutputKey := p.Steps[len(p.Steps)-1].OutputKey

	for i, step := range p.Steps {
		prompt := prompts.NewPromptTemplate(step.Template, step.Inputs)
		chain := chains.NewLLMChain(p.LLM, prompt)
		chain.OutputKey = step.OutputKey
		llmChains = append(llmChains, chain)

		// Collect top-level input keys (only from the first step's unique inputs)
		if i == 0 {
			allInputKeys = append(allInputKeys, step.Inputs...)
		}
	}

	seqChain, err := chains.NewSequentialChain(llmChains, allInputKeys, []string{finalOutputKey})
	if err != nil {
		return nil, fmt.Errorf("failed to create sequential chain: %w", err)
	}

	return chains.Call(ctx, seqChain, inputs)
}

// RunSimple executes a simple sequential chain where each step has a single input/output.
// The output of step N becomes the input of step N+1.
func (p *SequentialPipeline) RunSimple(ctx context.Context, input string) (string, error) {
	if len(p.Steps) == 0 {
		return "", fmt.Errorf("pipeline has no steps")
	}

	llmChains := make([]chains.Chain, 0, len(p.Steps))
	for _, step := range p.Steps {
		prompt := prompts.NewPromptTemplate(step.Template, step.Inputs)
		chain := chains.NewLLMChain(p.LLM, prompt)
		llmChains = append(llmChains, chain)
	}

	simpleChain, err := chains.NewSimpleSequentialChain(llmChains)
	if err != nil {
		return "", fmt.Errorf("failed to create simple sequential chain: %w", err)
	}

	return chains.Run(ctx, simpleChain, input)
}
