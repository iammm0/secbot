package patterns

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/tmc/langchaingo/llms"
)

type Iteration struct {
	Round    int     `json:"round"`
	Output   string  `json:"output"`
	Feedback string  `json:"feedback"`
	Score    float64 `json:"score"`
}

type ReflectionResult struct {
	FinalOutput string      `json:"final_output"`
	Iterations  []Iteration `json:"iterations"`
	Converged   bool        `json:"converged"`
}

type ReflectionLoop struct {
	Generator llms.Model
	Evaluator llms.Model
	MaxIter   int
	StopScore float64
}

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

func (r *ReflectionLoop) Run(ctx context.Context, task string) (*ReflectionResult, error) {
	result := &ReflectionResult{
		Iterations: make([]Iteration, 0, r.MaxIter),
	}

	output, err := r.generate(ctx, task, "", "")
	if err != nil {
		return nil, fmt.Errorf("初始生成失败: %w", err)
	}

	for i := 0; i < r.MaxIter; i++ {
		feedback, score, err := r.evaluate(ctx, task, output)
		if err != nil {
			return nil, fmt.Errorf("第 %d 轮评估失败: %w", i+1, err)
		}

		result.Iterations = append(result.Iterations, Iteration{
			Round: i + 1, Output: output, Feedback: feedback, Score: score,
		})

		if score >= r.StopScore {
			result.FinalOutput = output
			result.Converged = true
			return result, nil
		}

		output, err = r.generate(ctx, task, output, feedback)
		if err != nil {
			return nil, fmt.Errorf("第 %d 轮生成失败: %w", i+1, err)
		}
	}

	result.FinalOutput = output
	result.Converged = false
	return result, nil
}

func (r *ReflectionLoop) generate(ctx context.Context, task, prev, feedback string) (string, error) {
	var prompt string
	if prev == "" {
		prompt = fmt.Sprintf("请尽你所能完成以下任务:\n\n任务: %s", task)
	} else {
		prompt = fmt.Sprintf(`根据反馈改进你之前的输出。

任务: %s

之前的输出:
%s

改进反馈:
%s

请提供改进后的版本。`, task, prev, feedback)
	}

	return llms.GenerateFromSinglePrompt(ctx, r.Generator, prompt)
}

type evalResponse struct {
	Score    float64 `json:"score"`
	Feedback string  `json:"feedback"`
}

func (r *ReflectionLoop) evaluate(ctx context.Context, task, output string) (string, float64, error) {
	prompt := fmt.Sprintf(`你是一个评审员。评估以下输出的质量。

任务: %s

输出:
%s

以 JSON 格式回复:
{"score": <0.0到1.0的分数>, "feedback": "<具体改进建议>"}

仅回复 JSON。`, task, output)

	resp, err := llms.GenerateFromSinglePrompt(ctx, r.Evaluator, prompt,
		llms.WithTemperature(0.1),
	)
	if err != nil {
		return "", 0, err
	}

	resp = extractJSON(resp)
	var ev evalResponse
	if err := json.Unmarshal([]byte(resp), &ev); err != nil {
		return resp, 0.5, nil
	}

	if ev.Score < 0 {
		ev.Score = 0
	}
	if ev.Score > 1 {
		ev.Score = 1
	}
	return ev.Feedback, ev.Score, nil
}
