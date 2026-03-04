package multiagent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

// WorkerAgent is a specialized agent with a defined role.
type WorkerAgent struct {
	Name         string
	Role         string
	SystemPrompt string
	LLM          llms.Model
	Tools        []tools.Tool
}

// TaskAssignment is a sub-task assigned to a worker by the orchestrator.
type TaskAssignment struct {
	WorkerName  string `json:"worker"`
	Task        string `json:"task"`
	Priority    int    `json:"priority,omitempty"`
}

// WorkerOutput holds a worker's result.
type WorkerOutput struct {
	WorkerName string `json:"worker"`
	Task       string `json:"task"`
	Output     string `json:"output"`
	Success    bool   `json:"success"`
	Error      string `json:"error,omitempty"`
}

// OrchestratorResult holds the complete orchestration result.
type OrchestratorResult struct {
	OriginalGoal  string         `json:"original_goal"`
	Assignments   []TaskAssignment `json:"assignments"`
	WorkerOutputs []WorkerOutput   `json:"worker_outputs"`
	FinalOutput   string         `json:"final_output"`
}

// Orchestrator implements the orchestrator-worker multi-agent pattern.
// It decomposes tasks, delegates to specialized workers, and combines results.
type Orchestrator struct {
	Planner  llms.Model              // LLM for task decomposition
	Workers  map[string]*WorkerAgent // Named worker agents
	Combiner llms.Model              // LLM for synthesizing results
}

// NewOrchestrator creates a new orchestrator with the given workers.
func NewOrchestrator(planner llms.Model, combiner llms.Model, workers ...*WorkerAgent) *Orchestrator {
	workerMap := make(map[string]*WorkerAgent)
	for _, w := range workers {
		workerMap[w.Name] = w
	}
	return &Orchestrator{
		Planner:  planner,
		Workers:  workerMap,
		Combiner: combiner,
	}
}

// Execute runs the full orchestration pipeline: decompose -> delegate -> combine.
func (o *Orchestrator) Execute(ctx context.Context, goal string) (*OrchestratorResult, error) {
	result := &OrchestratorResult{
		OriginalGoal: goal,
	}

	// Step 1: Decompose the task
	assignments, err := o.decompose(ctx, goal)
	if err != nil {
		return nil, fmt.Errorf("decomposition failed: %w", err)
	}
	result.Assignments = assignments

	// Step 2: Execute worker tasks in parallel
	outputs := o.executeWorkers(ctx, assignments)
	result.WorkerOutputs = outputs

	// Step 3: Combine results
	finalOutput, err := o.combine(ctx, goal, outputs)
	if err != nil {
		return nil, fmt.Errorf("combination failed: %w", err)
	}
	result.FinalOutput = finalOutput

	return result, nil
}

func (o *Orchestrator) decompose(ctx context.Context, goal string) ([]TaskAssignment, error) {
	workerDescs := o.workerDescriptions()

	prompt := fmt.Sprintf(`You are a task orchestrator. Decompose the following goal into sub-tasks and assign each to the most appropriate worker.

Goal: %s

Available workers:
%s

Respond in JSON format:
{
  "assignments": [
    {"worker": "worker_name", "task": "specific sub-task description"}
  ]
}

Rules:
- Each worker should receive tasks matching their expertise
- Tasks should be specific and actionable
- A worker can be assigned multiple tasks
- Respond with valid JSON only.`, goal, workerDescs)

	resp, err := llms.GenerateFromSinglePrompt(ctx, o.Planner, prompt,
		llms.WithTemperature(0.1),
	)
	if err != nil {
		return nil, err
	}

	resp = extractJSON(resp)
	var parsed struct {
		Assignments []TaskAssignment `json:"assignments"`
	}
	if err := json.Unmarshal([]byte(resp), &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse assignments: %w (resp: %s)", err, resp)
	}

	return parsed.Assignments, nil
}

func (o *Orchestrator) executeWorkers(ctx context.Context, assignments []TaskAssignment) []WorkerOutput {
	outputs := make([]WorkerOutput, len(assignments))
	var wg sync.WaitGroup

	for i, assignment := range assignments {
		wg.Add(1)
		go func(idx int, a TaskAssignment) {
			defer wg.Done()
			worker, ok := o.Workers[a.WorkerName]
			if !ok {
				outputs[idx] = WorkerOutput{
					WorkerName: a.WorkerName,
					Task:       a.Task,
					Success:    false,
					Error:      fmt.Sprintf("worker %q not found", a.WorkerName),
				}
				return
			}

			output, err := o.runWorker(ctx, worker, a.Task)
			wo := WorkerOutput{
				WorkerName: a.WorkerName,
				Task:       a.Task,
				Output:     output,
				Success:    err == nil,
			}
			if err != nil {
				wo.Error = err.Error()
			}
			outputs[idx] = wo
		}(i, assignment)
	}

	wg.Wait()
	return outputs
}

func (o *Orchestrator) runWorker(ctx context.Context, worker *WorkerAgent, task string) (string, error) {
	messages := []llms.MessageContent{
		llms.TextParts(llms.ChatMessageTypeSystem, worker.SystemPrompt),
		llms.TextParts(llms.ChatMessageTypeHuman, task),
	}

	resp, err := worker.LLM.GenerateContent(ctx, messages)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response from worker %q", worker.Name)
	}
	return resp.Choices[0].Content, nil
}

func (o *Orchestrator) combine(ctx context.Context, goal string, outputs []WorkerOutput) (string, error) {
	var sb strings.Builder
	for _, out := range outputs {
		if out.Success {
			fmt.Fprintf(&sb, "[%s - %s]:\n%s\n\n", out.WorkerName, out.Task, out.Output)
		} else {
			fmt.Fprintf(&sb, "[%s - %s]: ERROR: %s\n\n", out.WorkerName, out.Task, out.Error)
		}
	}

	prompt := fmt.Sprintf(`You are synthesizing results from multiple specialized workers to achieve a goal.

Original Goal: %s

Worker Results:
%s

Please synthesize all worker outputs into a comprehensive, coherent final response that fully addresses the original goal.`, goal, sb.String())

	resp, err := llms.GenerateFromSinglePrompt(ctx, o.Combiner, prompt)
	if err != nil {
		return "", err
	}
	return resp, nil
}

func (o *Orchestrator) workerDescriptions() string {
	var sb strings.Builder
	for _, w := range o.Workers {
		fmt.Fprintf(&sb, "- %s (%s): %s\n", w.Name, w.Role, w.SystemPrompt[:min(len(w.SystemPrompt), 100)])
	}
	return sb.String()
}

func extractJSON(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}
