// Example 04: Parallel Pattern - 并行扇出
//
// 演示如何让多个"专家"并发分析同一问题，然后聚合结果。
// 用法: go run ./examples/04_parallel/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/parallel"

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

	// Multi-perspective analysis
	fmt.Println("=== Parallel Fan-Out: Multi-Perspective Analysis ===")
	fmt.Println("Analyzing a business idea from different expert perspectives...")
	fmt.Println()

	fanout := parallel.NewFanOut(
		[]parallel.Worker{
			{
				Name:   "Business Analyst",
				Prompt: "You are a business analyst. Evaluate the business viability, market size, and revenue potential. Be concise (100 words max).",
				LLM:    model,
			},
			{
				Name:   "Technical Architect",
				Prompt: "You are a technical architect. Evaluate the technical feasibility, required stack, and engineering challenges. Be concise (100 words max).",
				LLM:    model,
			},
			{
				Name:   "Risk Assessor",
				Prompt: "You are a risk assessor. Identify the top 3 risks and mitigation strategies. Be concise (100 words max).",
				LLM:    model,
			},
		},
		parallel.LLMSynthesisAggregator(model,
			"Synthesize the following expert analyses into a concise executive summary (150 words max) with a clear recommendation."),
	)

	input := "Build an AI-powered code review tool that integrates with GitHub and provides automated suggestions for code improvement."

	synthesis, results, err := fanout.ExecuteWithResults(ctx, input)
	if err != nil {
		log.Fatalf("Fan-out failed: %v", err)
	}

	// Print individual perspectives
	for _, r := range results {
		fmt.Printf("--- %s ---\n", r.Name)
		if r.Err != nil {
			fmt.Printf("Error: %v\n\n", r.Err)
		} else {
			fmt.Printf("%s\n\n", r.Output)
		}
	}

	// Print synthesis
	fmt.Println("=== Synthesized Summary ===")
	fmt.Println(synthesis)
}
