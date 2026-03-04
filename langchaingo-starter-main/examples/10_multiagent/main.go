// Example 10: Multi-Agent Collaboration - 编排器-工作者模式
//
// 演示 Orchestrator 将任务分配给多个专业 Worker Agent，然后综合结果。
// 用法: go run ./examples/10_multiagent/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/multiagent"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	model, err := llm.NewLLM(cfg)
	if err != nil {
		log.Fatalf("Failed to create LLM: %v", err)
	}

	ctx := context.Background()

	fmt.Println("=== Multi-Agent: Orchestrator-Worker Pattern ===")
	fmt.Println("An orchestrator decomposes tasks and assigns them to specialized workers.")
	fmt.Println()

	// Create specialized worker agents
	orchestrator := multiagent.NewOrchestrator(
		model, // planner
		model, // combiner
		&multiagent.WorkerAgent{
			Name:         "researcher",
			Role:         "Research Analyst",
			SystemPrompt: "You are a research analyst. Provide thorough, factual analysis with data and evidence. Be concise (150 words max).",
			LLM:          model,
		},
		&multiagent.WorkerAgent{
			Name:         "writer",
			Role:         "Technical Writer",
			SystemPrompt: "You are a technical writer. Create clear, well-structured content with proper formatting. Be concise (150 words max).",
			LLM:          model,
		},
		&multiagent.WorkerAgent{
			Name:         "critic",
			Role:         "Quality Reviewer",
			SystemPrompt: "You are a quality reviewer. Identify potential issues, suggest improvements, and ensure accuracy. Be concise (150 words max).",
			LLM:          model,
		},
	)

	goal := "Create a brief technical comparison of Go and Rust for building web services, covering performance, developer experience, and ecosystem."
	fmt.Printf("Goal: %s\n\n", goal)

	result, err := orchestrator.Execute(ctx, goal)
	if err != nil {
		log.Fatalf("Orchestration failed: %v", err)
	}

	// Print assignments
	fmt.Println("--- Task Assignments ---")
	for _, a := range result.Assignments {
		fmt.Printf("  [%s] %s\n", a.WorkerName, a.Task)
	}

	// Print worker outputs
	fmt.Println("\n--- Worker Outputs ---")
	for _, wo := range result.WorkerOutputs {
		if wo.Success {
			fmt.Printf("\n[%s]:\n%s\n", wo.WorkerName, truncate(wo.Output, 300))
		} else {
			fmt.Printf("\n[%s]: ERROR - %s\n", wo.WorkerName, wo.Error)
		}
	}

	// Print final synthesis
	fmt.Println("\n=== Final Synthesis ===")
	fmt.Println(result.FinalOutput)
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}
