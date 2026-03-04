package parallel

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/tmc/langchaingo/llms"
)

// Worker represents a single parallel worker with its own prompt/perspective.
type Worker struct {
	Name   string     // Worker identifier
	Prompt string     // System prompt defining this worker's perspective
	LLM    llms.Model // LLM to use (can share the same model)
}

// WorkerResult holds the output from a single worker.
type WorkerResult struct {
	Name   string
	Output string
	Err    error
}

// Aggregator combines multiple worker results into a final output.
type Aggregator func(results []WorkerResult) (string, error)

// FanOut executes multiple workers in parallel and aggregates their results.
type FanOut struct {
	Workers    []Worker
	Aggregator Aggregator
}

// NewFanOut creates a new fan-out pattern instance.
func NewFanOut(workers []Worker, aggregator Aggregator) *FanOut {
	return &FanOut{
		Workers:    workers,
		Aggregator: aggregator,
	}
}

// Execute runs all workers concurrently with the given input and aggregates results.
func (f *FanOut) Execute(ctx context.Context, input string) (string, error) {
	results := make([]WorkerResult, len(f.Workers))
	var wg sync.WaitGroup

	for i, worker := range f.Workers {
		wg.Add(1)
		go func(idx int, w Worker) {
			defer wg.Done()
			output, err := runWorker(ctx, w, input)
			results[idx] = WorkerResult{
				Name:   w.Name,
				Output: output,
				Err:    err,
			}
		}(i, worker)
	}

	wg.Wait()
	return f.Aggregator(results)
}

// ExecuteWithResults runs all workers and returns individual results along with aggregated output.
func (f *FanOut) ExecuteWithResults(ctx context.Context, input string) (string, []WorkerResult, error) {
	results := make([]WorkerResult, len(f.Workers))
	var wg sync.WaitGroup

	for i, worker := range f.Workers {
		wg.Add(1)
		go func(idx int, w Worker) {
			defer wg.Done()
			output, err := runWorker(ctx, w, input)
			results[idx] = WorkerResult{
				Name:   w.Name,
				Output: output,
				Err:    err,
			}
		}(i, worker)
	}

	wg.Wait()

	aggregated, err := f.Aggregator(results)
	return aggregated, results, err
}

func runWorker(ctx context.Context, w Worker, input string) (string, error) {
	messages := []llms.MessageContent{
		llms.TextParts(llms.ChatMessageTypeSystem, w.Prompt),
		llms.TextParts(llms.ChatMessageTypeHuman, input),
	}

	resp, err := w.LLM.GenerateContent(ctx, messages)
	if err != nil {
		return "", fmt.Errorf("worker %q failed: %w", w.Name, err)
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("worker %q: no response", w.Name)
	}
	return resp.Choices[0].Content, nil
}

// --- Built-in Aggregators ---

// ConcatAggregator concatenates all results with headers.
func ConcatAggregator() Aggregator {
	return func(results []WorkerResult) (string, error) {
		var sb strings.Builder
		for _, r := range results {
			if r.Err != nil {
				fmt.Fprintf(&sb, "## %s (ERROR)\n%v\n\n", r.Name, r.Err)
				continue
			}
			fmt.Fprintf(&sb, "## %s\n%s\n\n", r.Name, r.Output)
		}
		return sb.String(), nil
	}
}

// LLMSynthesisAggregator uses an LLM to synthesize all worker results into a unified response.
func LLMSynthesisAggregator(llm llms.Model, synthesisPrompt string) Aggregator {
	return func(results []WorkerResult) (string, error) {
		var sb strings.Builder
		for _, r := range results {
			if r.Err != nil {
				continue
			}
			fmt.Fprintf(&sb, "[%s]: %s\n\n", r.Name, r.Output)
		}

		prompt := fmt.Sprintf("%s\n\nHere are the perspectives from different analysts:\n\n%s", synthesisPrompt, sb.String())
		resp, err := llms.GenerateFromSinglePrompt(context.Background(), llm, prompt)
		if err != nil {
			return "", fmt.Errorf("synthesis failed: %w", err)
		}
		return resp, nil
	}
}

// VotingAggregator selects the most common response (simple majority).
// Useful when multiple workers solve the same problem independently.
func VotingAggregator() Aggregator {
	return func(results []WorkerResult) (string, error) {
		votes := make(map[string]int)
		for _, r := range results {
			if r.Err != nil {
				continue
			}
			normalized := strings.TrimSpace(r.Output)
			votes[normalized]++
		}

		bestOutput := ""
		bestCount := 0
		for output, count := range votes {
			if count > bestCount {
				bestOutput = output
				bestCount = count
			}
		}

		if bestOutput == "" {
			return "", fmt.Errorf("no valid results to vote on")
		}
		return bestOutput, nil
	}
}
