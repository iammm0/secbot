package reflection

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// Iteration records one generate-evaluate cycle.
type Iteration struct {
	Round    int     `json:"round"`
	Output   string  `json:"output"`
	Feedback string  `json:"feedback"`
	Score    float64 `json:"score"`
}

// Result holds the full reflection loop result.
type Result struct {
	FinalOutput string      `json:"final_output"`
	Iterations  []Iteration `json:"iterations"`
	Converged   bool        `json:"converged"`
}

// ReflectionLoop implements the generate -> evaluate -> improve iterative pattern.
type ReflectionLoop struct {
	Generator llms.Model // LLM for generating content
	Evaluator llms.Model // LLM for evaluating (can be the same)
	MaxIter   int        // Maximum iterations
	StopScore float64    // Stop if evaluation score >= this value (0-1)
}

// NewReflectionLoop creates a new reflection loop.
// If evaluator is nil, the generator will be used for both roles.
func NewReflectionLoop(generator, evaluator llms.Model, maxIter int, stopScore float64) *ReflectionLoop {
	if evaluator == nil {
		evaluator = generator
	}
	return &ReflectionLoop{
		Generator: generator,
		Evaluator: evaluator,
		MaxIter:   maxIter,
		StopScore: stopScore,
	}
}

// Run executes the reflection loop for the given task.
func (r *ReflectionLoop) Run(ctx context.Context, task string) (*Result, error) {
	result := &Result{
		Iterations: make([]Iteration, 0, r.MaxIter),
	}

	// Initial generation
	output, err := r.generate(ctx, task, "", "")
	if err != nil {
		return nil, fmt.Errorf("initial generation failed: %w", err)
	}

	for i := 0; i < r.MaxIter; i++ {
		// Evaluate
		feedback, score, err := r.evaluate(ctx, task, output)
		if err != nil {
			return nil, fmt.Errorf("evaluation in round %d failed: %w", i+1, err)
		}

		iter := Iteration{
			Round:    i + 1,
			Output:   output,
			Feedback: feedback,
			Score:    score,
		}
		result.Iterations = append(result.Iterations, iter)

		// Check convergence
		if score >= r.StopScore {
			result.FinalOutput = output
			result.Converged = true
			return result, nil
		}

		// Improve based on feedback
		output, err = r.generate(ctx, task, output, feedback)
		if err != nil {
			return nil, fmt.Errorf("generation in round %d failed: %w", i+1, err)
		}
	}

	// Did not converge, return best effort
	result.FinalOutput = output
	result.Converged = false
	return result, nil
}

func (r *ReflectionLoop) generate(ctx context.Context, task, previousOutput, feedback string) (string, error) {
	var prompt string
	if previousOutput == "" {
		prompt = fmt.Sprintf("Complete the following task to the best of your ability.\n\nTask: %s", task)
	} else {
		prompt = fmt.Sprintf(`Improve your previous output based on the feedback provided.

Task: %s

Your previous output:
%s

Feedback for improvement:
%s

Please provide an improved version addressing all the feedback points.`, task, previousOutput, feedback)
	}

	resp, err := llms.GenerateFromSinglePrompt(ctx, r.Generator, prompt)
	if err != nil {
		return "", err
	}
	return resp, nil
}

type evalResponse struct {
	Score    float64 `json:"score"`
	Feedback string  `json:"feedback"`
}

func (r *ReflectionLoop) evaluate(ctx context.Context, task, output string) (string, float64, error) {
	prompt := fmt.Sprintf(`You are a critical evaluator. Evaluate the following output for the given task.

Task: %s

Output to evaluate:
%s

Respond in JSON format with exactly these fields:
{
  "score": <float between 0.0 and 1.0>,
  "feedback": "<specific, actionable feedback for improvement>"
}

Scoring guidelines:
- 0.0-0.3: Poor quality, major issues
- 0.3-0.5: Below average, significant improvements needed
- 0.5-0.7: Acceptable but could be better
- 0.7-0.85: Good quality with minor improvements possible
- 0.85-1.0: Excellent quality

Be strict but fair. Provide specific, actionable feedback.`, task, output)

	resp, err := llms.GenerateFromSinglePrompt(ctx, r.Evaluator, prompt,
		llms.WithTemperature(0.1),
	)
	if err != nil {
		return "", 0, err
	}

	// Try to parse JSON response
	resp = extractJSON(resp)
	var evalResp evalResponse
	if err := json.Unmarshal([]byte(resp), &evalResp); err != nil {
		// If JSON parsing fails, return the raw response as feedback with a default score
		return resp, 0.5, nil
	}

	// Clamp score to [0, 1]
	if evalResp.Score < 0 {
		evalResp.Score = 0
	}
	if evalResp.Score > 1 {
		evalResp.Score = 1
	}

	return evalResp.Feedback, evalResp.Score, nil
}

// extractJSON tries to find a JSON object in the response string.
func extractJSON(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}
