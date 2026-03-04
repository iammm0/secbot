// Example 02: Sequential Chain - 多步流水线
//
// 演示如何将多个 LLM 调用串联，前一步的输出自动作为后一步的输入。
// 用法: go run ./examples/02_sequential_chain/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/chaining"

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

	// Pipeline: Topic -> Outline -> Article -> Review
	fmt.Println("=== Sequential Chain: Content Pipeline ===")
	fmt.Println("Topic -> Outline -> Draft -> Review")
	fmt.Println()

	pipeline := chaining.NewSequentialPipeline(model, []chaining.Step{
		{
			Name:      "Generate Outline",
			Template:  "Create a brief outline (3-4 points) for a blog post about: {{.topic}}",
			Inputs:    []string{"topic"},
			OutputKey: "outline",
		},
		{
			Name:      "Write Draft",
			Template:  "Write a short blog post (200 words) based on this outline:\n\n{{.outline}}",
			Inputs:    []string{"outline"},
			OutputKey: "draft",
		},
		{
			Name:      "Review",
			Template:  "Review the following blog post and provide 3 specific suggestions for improvement:\n\n{{.draft}}",
			Inputs:    []string{"draft"},
			OutputKey: "review",
		},
	})

	result, err := pipeline.Run(ctx, map[string]any{
		"topic": "Why Go is great for building AI agents",
	})
	if err != nil {
		log.Fatalf("Pipeline failed: %v", err)
	}

	fmt.Println("=== Review Result ===")
	fmt.Println(result["review"])

	// Gated Pipeline example
	fmt.Println("\n=== Gated Pipeline: Quality Check ===")
	gatedPipeline := chaining.NewGatedPipeline(model, []chaining.GateStep{
		{
			Name:     "Draft Answer",
			Template: "Answer this question concisely: {{.input}}",
		},
		{
			Name:     "Quality Check",
			Template: "Is the following answer high quality and accurate? Reply YES or NO with a brief reason.\n\nAnswer: {{.previous}}",
			Gate:     chaining.ContainsGate("yes"),
		},
		{
			Name:     "Polish",
			Template: "Polish and improve this answer for clarity:\n\n{{.previous}}",
		},
	})

	gResult, err := gatedPipeline.Run(ctx, "What is the capital of France?")
	if err != nil {
		log.Fatalf("Gated pipeline failed: %v", err)
	}

	fmt.Printf("Completed: %v\n", gResult.Completed)
	fmt.Printf("Final Output: %s\n", gResult.FinalOutput)
	for _, step := range gResult.Steps {
		fmt.Printf("  Step [%s] gated=%v\n", step.StepName, step.Gated)
	}
}
