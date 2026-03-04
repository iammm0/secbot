// Example 03: Routing Pattern - 动态路由分发
//
// 演示如何用 LLM 对输入进行分类，然后路由到专业 Handler 处理。
// 用法: go run ./examples/03_routing/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/routing"

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

	// Create specialized handlers
	router := routing.NewRouter(
		model,
		[]routing.Category{
			{
				Name:        "technical",
				Description: "Technical questions about programming, software, algorithms, or technology",
				Handler:     routing.LLMHandler(model, "You are a senior software engineer. Answer technical questions with code examples when appropriate."),
			},
			{
				Name:        "creative",
				Description: "Creative writing, storytelling, poetry, or artistic content requests",
				Handler:     routing.LLMHandler(model, "You are a creative writer. Provide imaginative and engaging responses."),
			},
			{
				Name:        "math",
				Description: "Mathematical calculations, equations, or numerical problems",
				Handler:     routing.LLMHandler(model, "You are a mathematician. Solve problems step by step showing your work."),
			},
			{
				Name:        "general",
				Description: "General knowledge questions, facts, or everyday topics",
				Handler:     routing.LLMHandler(model, "You are a knowledgeable assistant. Provide clear and helpful answers."),
			},
		},
		routing.LLMHandler(model, "You are a helpful assistant. Answer the question to the best of your ability."),
	)

	// Test with different types of inputs
	testInputs := []string{
		"How do I implement a binary search tree in Go?",
		"Write a haiku about artificial intelligence",
		"What is the integral of x^2 dx?",
		"What is the population of Tokyo?",
	}

	for _, input := range testInputs {
		fmt.Printf("=== Input: %s ===\n", input)
		result, err := router.RouteWithInfo(ctx, input)
		if err != nil {
			log.Printf("Routing failed: %v", err)
			continue
		}
		fmt.Printf("Category: %s\n", result.Category)
		fmt.Printf("Response: %s\n\n", truncate(result.Output, 300))
	}
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}
