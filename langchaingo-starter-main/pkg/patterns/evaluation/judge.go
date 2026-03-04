package evaluation

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// Criterion defines a single evaluation dimension.
type Criterion struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Weight      float64 `json:"weight"` // Weight for weighted average (0-1)
}

// EvalResult holds the evaluation results.
type EvalResult struct {
	Scores    map[string]float64 `json:"scores"`     // score per criterion
	Overall   float64            `json:"overall"`     // weighted average
	Reasoning string             `json:"reasoning"`   // evaluation reasoning
}

// Evaluator implements the LLM-as-Judge pattern for evaluating outputs.
type Evaluator struct {
	Judge    llms.Model
	Criteria []Criterion
}

// NewEvaluator creates a new evaluator with the given criteria.
func NewEvaluator(judge llms.Model, criteria []Criterion) *Evaluator {
	return &Evaluator{
		Judge:    judge,
		Criteria: criteria,
	}
}

// DefaultCriteria returns a standard set of evaluation criteria.
func DefaultCriteria() []Criterion {
	return []Criterion{
		{Name: "relevance", Description: "How relevant is the output to the input/task?", Weight: 0.3},
		{Name: "accuracy", Description: "How factually accurate is the output?", Weight: 0.3},
		{Name: "helpfulness", Description: "How helpful and actionable is the output?", Weight: 0.2},
		{Name: "clarity", Description: "How clear and well-structured is the output?", Weight: 0.2},
	}
}

// Evaluate scores an output against the configured criteria.
func (e *Evaluator) Evaluate(ctx context.Context, input, output string) (*EvalResult, error) {
	criteriaDesc := e.buildCriteriaDescription()

	prompt := fmt.Sprintf(`You are an expert evaluator. Evaluate the following output for the given input.

Input/Task: %s

Output to evaluate:
%s

Evaluation Criteria:
%s

Score each criterion from 0.0 to 1.0 and provide brief reasoning.

Respond in JSON format:
{
  "scores": {
    %s
  },
  "reasoning": "overall evaluation reasoning"
}

Be objective and precise. Respond with valid JSON only.`, input, output, criteriaDesc, e.buildScoreTemplate())

	resp, err := llms.GenerateFromSinglePrompt(ctx, e.Judge, prompt,
		llms.WithTemperature(0.1),
	)
	if err != nil {
		return nil, fmt.Errorf("evaluation failed: %w", err)
	}

	return e.parseResult(resp)
}

// Compare evaluates two outputs and returns which is better.
func (e *Evaluator) Compare(ctx context.Context, input, outputA, outputB string) (string, *EvalResult, *EvalResult, error) {
	resultA, err := e.Evaluate(ctx, input, outputA)
	if err != nil {
		return "", nil, nil, fmt.Errorf("evaluating output A failed: %w", err)
	}

	resultB, err := e.Evaluate(ctx, input, outputB)
	if err != nil {
		return "", nil, nil, fmt.Errorf("evaluating output B failed: %w", err)
	}

	winner := "tie"
	if resultA.Overall > resultB.Overall+0.05 {
		winner = "A"
	} else if resultB.Overall > resultA.Overall+0.05 {
		winner = "B"
	}

	return winner, resultA, resultB, nil
}

// BatchEvaluate evaluates multiple outputs for the same input.
func (e *Evaluator) BatchEvaluate(ctx context.Context, input string, outputs []string) ([]*EvalResult, error) {
	results := make([]*EvalResult, len(outputs))
	for i, output := range outputs {
		result, err := e.Evaluate(ctx, input, output)
		if err != nil {
			return nil, fmt.Errorf("evaluation of output %d failed: %w", i, err)
		}
		results[i] = result
	}
	return results, nil
}

func (e *Evaluator) buildCriteriaDescription() string {
	var sb strings.Builder
	for _, c := range e.Criteria {
		fmt.Fprintf(&sb, "- %s (weight: %.1f): %s\n", c.Name, c.Weight, c.Description)
	}
	return sb.String()
}

func (e *Evaluator) buildScoreTemplate() string {
	parts := make([]string, len(e.Criteria))
	for i, c := range e.Criteria {
		parts[i] = fmt.Sprintf(`"%s": <score 0.0-1.0>`, c.Name)
	}
	return strings.Join(parts, ",\n    ")
}

func (e *Evaluator) parseResult(resp string) (*EvalResult, error) {
	resp = extractJSON(resp)

	var raw struct {
		Scores    map[string]float64 `json:"scores"`
		Reasoning string             `json:"reasoning"`
	}
	if err := json.Unmarshal([]byte(resp), &raw); err != nil {
		// Best effort: return with default scores
		return &EvalResult{
			Scores:    make(map[string]float64),
			Overall:   0.5,
			Reasoning: resp,
		}, nil
	}

	// Calculate weighted average
	var totalWeight, weightedSum float64
	for _, c := range e.Criteria {
		if score, ok := raw.Scores[c.Name]; ok {
			// Clamp score
			if score < 0 {
				score = 0
			}
			if score > 1 {
				score = 1
			}
			raw.Scores[c.Name] = score
			weightedSum += score * c.Weight
			totalWeight += c.Weight
		}
	}

	overall := 0.0
	if totalWeight > 0 {
		overall = weightedSum / totalWeight
	}

	return &EvalResult{
		Scores:    raw.Scores,
		Overall:   overall,
		Reasoning: raw.Reasoning,
	}, nil
}

func extractJSON(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}
