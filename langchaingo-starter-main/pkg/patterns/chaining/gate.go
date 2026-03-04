package chaining

import (
	"context"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// GateFunc decides whether a pipeline step should proceed.
// Returns true to continue, false to stop.
type GateFunc func(stepOutput string) bool

// GateStep defines a step with an optional gate condition.
type GateStep struct {
	Name     string   // Human-readable name
	Template string   // Prompt template
	Inputs   []string // Input keys for this step
	Gate     GateFunc // nil = always pass (no gate)
}

// GatedPipeline executes steps in sequence with optional gate checks.
// If a gate returns false, the pipeline stops and returns the last successful output.
type GatedPipeline struct {
	LLM   llms.Model
	Steps []GateStep
}

// NewGatedPipeline creates a new gated pipeline.
func NewGatedPipeline(llm llms.Model, steps []GateStep) *GatedPipeline {
	return &GatedPipeline{
		LLM:   llm,
		Steps: steps,
	}
}

// StepResult holds the result of a single pipeline step.
type StepResult struct {
	StepName string
	Output   string
	Gated    bool // true if this step was stopped by its gate
}

// PipelineResult holds the full pipeline execution result.
type PipelineResult struct {
	Steps      []StepResult
	FinalOutput string
	Completed  bool // true if all steps completed without gate stops
}

// Run executes the gated pipeline. Each step's output is available as {{.previous}}
// in the next step's template. The original input is available as {{.input}}.
func (p *GatedPipeline) Run(ctx context.Context, input string) (*PipelineResult, error) {
	if len(p.Steps) == 0 {
		return nil, fmt.Errorf("pipeline has no steps")
	}

	result := &PipelineResult{
		Steps: make([]StepResult, 0, len(p.Steps)),
	}
	previous := input

	for _, step := range p.Steps {
		// Build the prompt by replacing template variables
		prompt := step.Template
		prompt = strings.ReplaceAll(prompt, "{{.input}}", input)
		prompt = strings.ReplaceAll(prompt, "{{.previous}}", previous)

		// Call LLM
		output, err := llms.GenerateFromSinglePrompt(ctx, p.LLM, prompt)
		if err != nil {
			return result, fmt.Errorf("step %q failed: %w", step.Name, err)
		}

		stepResult := StepResult{
			StepName: step.Name,
			Output:   output,
		}

		// Check gate
		if step.Gate != nil && !step.Gate(output) {
			stepResult.Gated = true
			result.Steps = append(result.Steps, stepResult)
			result.FinalOutput = previous // Return the last successful output
			result.Completed = false
			return result, nil
		}

		result.Steps = append(result.Steps, stepResult)
		previous = output
	}

	result.FinalOutput = previous
	result.Completed = true
	return result, nil
}

// Common gate functions

// MinLengthGate creates a gate that requires output to be at least minLen characters.
func MinLengthGate(minLen int) GateFunc {
	return func(output string) bool {
		return len(strings.TrimSpace(output)) >= minLen
	}
}

// ContainsGate creates a gate that requires the output to contain a specific substring.
func ContainsGate(substr string) GateFunc {
	return func(output string) bool {
		return strings.Contains(strings.ToLower(output), strings.ToLower(substr))
	}
}

// NotContainsGate creates a gate that rejects output containing a specific substring.
func NotContainsGate(substr string) GateFunc {
	return func(output string) bool {
		return !strings.Contains(strings.ToLower(output), strings.ToLower(substr))
	}
}
