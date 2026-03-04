package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/chaining"
	"langchaingo-starter/pkg/patterns/evaluation"
	"langchaingo-starter/pkg/patterns/guardrails"
	"langchaingo-starter/pkg/patterns/parallel"
	"langchaingo-starter/pkg/patterns/planning"
	"langchaingo-starter/pkg/patterns/reflection"
	"langchaingo-starter/pkg/patterns/routing"
	"langchaingo-starter/pkg/tools"

	"github.com/tmc/langchaingo/llms"
)

// RunRequest is the unified request body for all patterns.
type RunRequest struct {
	Pattern string         `json:"pattern"`
	Input   string         `json:"input"`
	Options map[string]any `json:"options,omitempty"`
}

// RunResponse is the unified response body.
type RunResponse struct {
	Pattern string `json:"pattern"`
	Output  string `json:"output"`
	Error   string `json:"error,omitempty"`
}

// PatternInfo describes an available pattern.
type PatternInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Example     string `json:"example_input"`
}

// Server holds all server dependencies.
type Server struct {
	cfg      *config.Config
	model    llms.Model
	registry *tools.Registry
}

// NewServer creates a new server instance.
func NewServer(cfg *config.Config) (*Server, error) {
	model, err := llm.NewLLM(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create LLM: %w", err)
	}
	return &Server{
		cfg:      cfg,
		model:    model,
		registry: tools.DefaultRegistry(),
	}, nil
}

func (s *Server) handlePatterns(w http.ResponseWriter, _ *http.Request) {
	patterns := []PatternInfo{
		{Name: "simple_chain", Description: "Single-step LLM chain with prompt template", Example: "Translate 'hello' to French"},
		{Name: "sequential_chain", Description: "Multi-step pipeline (topic -> outline -> draft)", Example: "AI agent design patterns"},
		{Name: "routing", Description: "LLM classifies input and routes to specialist", Example: "How do I sort a linked list?"},
		{Name: "parallel", Description: "Multiple experts analyze in parallel", Example: "Should we migrate from Python to Go?"},
		{Name: "reflection", Description: "Generate -> evaluate -> improve loop", Example: "Write a haiku about coding"},
		{Name: "planning", Description: "Goal decomposition and step-by-step execution", Example: "Find weather in Beijing and convert to Fahrenheit"},
		{Name: "evaluation", Description: "LLM-as-Judge multi-criteria scoring", Example: "Rate this: Go is fast."},
		{Name: "guardrails", Description: "Input/output safety validation", Example: "What is Go?"},
		{Name: "chat", Description: "Simple chat completion", Example: "Hello, how are you?"},
	}
	writeJSON(w, http.StatusOK, patterns)
}

func (s *Server) handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, RunResponse{Error: "POST required"})
		return
	}

	var req RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, RunResponse{Error: "invalid JSON: " + err.Error()})
		return
	}

	if req.Input == "" {
		writeJSON(w, http.StatusBadRequest, RunResponse{Error: "input is required"})
		return
	}

	ctx := r.Context()
	var output string
	var err error

	switch req.Pattern {
	case "chat":
		output, err = s.runChat(ctx, req)
	case "simple_chain":
		output, err = s.runSimpleChain(ctx, req)
	case "sequential_chain":
		output, err = s.runSequentialChain(ctx, req)
	case "routing":
		output, err = s.runRouting(ctx, req)
	case "parallel":
		output, err = s.runParallel(ctx, req)
	case "reflection":
		output, err = s.runReflection(ctx, req)
	case "planning":
		output, err = s.runPlanning(ctx, req)
	case "evaluation":
		output, err = s.runEvaluation(ctx, req)
	case "guardrails":
		output, err = s.runGuardrails(ctx, req)
	default:
		writeJSON(w, http.StatusBadRequest, RunResponse{
			Pattern: req.Pattern,
			Error:   fmt.Sprintf("unknown pattern: %q. GET /api/patterns for available patterns", req.Pattern),
		})
		return
	}

	if err != nil {
		writeJSON(w, http.StatusInternalServerError, RunResponse{Pattern: req.Pattern, Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, RunResponse{Pattern: req.Pattern, Output: output})
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}

	var req RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	chain := chaining.NewSimpleChain(s.model, "{{.input}}", []string{"input"})

	_, err := chain.RunWithStreaming(ctx, req.Input, func(_ context.Context, chunk []byte) error {
		fmt.Fprintf(w, "data: %s\n\n", string(chunk))
		flusher.Flush()
		return nil
	})

	if err != nil {
		fmt.Fprintf(w, "data: [ERROR] %s\n\n", err.Error())
		flusher.Flush()
	}

	fmt.Fprintf(w, "data: [DONE]\n\n")
	flusher.Flush()
}

// --- Pattern implementations ---

func (s *Server) runChat(ctx context.Context, req RunRequest) (string, error) {
	return llms.GenerateFromSinglePrompt(ctx, s.model, req.Input)
}

func (s *Server) runSimpleChain(ctx context.Context, req RunRequest) (string, error) {
	chain := chaining.NewSimpleChain(s.model, "{{.input}}", []string{"input"})
	return chain.Run(ctx, req.Input)
}

func (s *Server) runSequentialChain(ctx context.Context, req RunRequest) (string, error) {
	pipeline := chaining.NewSequentialPipeline(s.model, []chaining.Step{
		{Name: "Outline", Template: "Create a brief outline for: {{.topic}}", Inputs: []string{"topic"}, OutputKey: "outline"},
		{Name: "Draft", Template: "Write a short article from this outline:\n{{.outline}}", Inputs: []string{"outline"}, OutputKey: "draft"},
	})
	result, err := pipeline.Run(ctx, map[string]any{"topic": req.Input})
	if err != nil {
		return "", err
	}
	if v, ok := result["draft"]; ok {
		return fmt.Sprintf("%v", v), nil
	}
	return fmt.Sprintf("%v", result), nil
}

func (s *Server) runRouting(ctx context.Context, req RunRequest) (string, error) {
	router := routing.NewRouter(s.model, []routing.Category{
		{Name: "technical", Description: "Technical questions", Handler: routing.LLMHandler(s.model, "You are a senior engineer. Answer technical questions.")},
		{Name: "creative", Description: "Creative writing", Handler: routing.LLMHandler(s.model, "You are a creative writer.")},
		{Name: "general", Description: "General questions", Handler: routing.LLMHandler(s.model, "You are a helpful assistant.")},
	}, routing.LLMHandler(s.model, "You are a helpful assistant."))
	result, err := router.RouteWithInfo(ctx, req.Input)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("[Routed to: %s]\n%s", result.Category, result.Output), nil
}

func (s *Server) runParallel(ctx context.Context, req RunRequest) (string, error) {
	fanout := parallel.NewFanOut(
		[]parallel.Worker{
			{Name: "Analyst A", Prompt: "Analyze from a technical perspective (100 words max).", LLM: s.model},
			{Name: "Analyst B", Prompt: "Analyze from a business perspective (100 words max).", LLM: s.model},
		},
		parallel.ConcatAggregator(),
	)
	return fanout.Execute(ctx, req.Input)
}

func (s *Server) runReflection(ctx context.Context, req RunRequest) (string, error) {
	maxIter := 2
	stopScore := 0.8
	if v, ok := req.Options["max_iterations"]; ok {
		if f, ok := v.(float64); ok {
			maxIter = int(f)
		}
	}
	if v, ok := req.Options["stop_score"]; ok {
		if f, ok := v.(float64); ok {
			stopScore = f
		}
	}
	loop := reflection.NewReflectionLoop(s.model, s.model, maxIter, stopScore)
	result, err := loop.Run(ctx, req.Input)
	if err != nil {
		return "", err
	}
	return result.FinalOutput, nil
}

func (s *Server) runPlanning(ctx context.Context, req RunRequest) (string, error) {
	planner := planning.NewPlanner(s.model, s.registry.All(), 6)
	result, err := planner.PlanAndExecute(ctx, req.Input)
	if err != nil {
		return "", err
	}
	return result.FinalOutput, nil
}

func (s *Server) runEvaluation(ctx context.Context, req RunRequest) (string, error) {
	evaluator := evaluation.NewEvaluator(s.model, evaluation.DefaultCriteria())
	result, err := evaluator.Evaluate(ctx, "Evaluate this text", req.Input)
	if err != nil {
		return "", err
	}
	b, _ := json.MarshalIndent(result, "", "  ")
	return string(b), nil
}

func (s *Server) runGuardrails(ctx context.Context, req RunRequest) (string, error) {
	guarded := guardrails.NewGuardedLLM(s.model, guardrails.DefaultInputGuards(), guardrails.DefaultOutputGuards())
	return guarded.Generate(ctx, req.Input)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}
