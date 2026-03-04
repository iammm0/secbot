// Example 08: Advanced Prompting - 高级提示工程技术
//
// 演示 Zero-Shot, Few-Shot, Chain-of-Thought, ReAct 等提示模板的使用。
// 用法: go run ./examples/08_prompting/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/prompting"

	"github.com/joho/godotenv"
	"github.com/tmc/langchaingo/llms"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	model, err := llm.NewLLM(cfg)
	if err != nil {
		log.Fatalf("Failed to create LLM: %v", err)
	}

	ctx := context.Background()

	// 1. Zero-Shot
	fmt.Println("=== Zero-Shot ===")
	prompt := prompting.ZeroShotWithRole(
		"a Go programming expert",
		"Explain the difference between a goroutine and a thread in 3 sentences.",
	)
	resp, err := llms.GenerateFromSinglePrompt(ctx, model, prompt)
	if err != nil {
		log.Fatalf("Zero-shot failed: %v", err)
	}
	fmt.Println(resp)

	// 2. Few-Shot
	fmt.Println("\n=== Few-Shot (Sentiment Analysis) ===")
	prompt = prompting.FewShot(
		"The new update broke everything, I'm so frustrated!",
		[]prompting.Example{
			{Input: "I love this product, it works perfectly!", Output: "Positive"},
			{Input: "The delivery was late and the item was damaged.", Output: "Negative"},
			{Input: "It's okay, nothing special.", Output: "Neutral"},
		},
	)
	resp, err = llms.GenerateFromSinglePrompt(ctx, model, prompt)
	if err != nil {
		log.Fatalf("Few-shot failed: %v", err)
	}
	fmt.Println(resp)

	// 3. Chain-of-Thought
	fmt.Println("\n=== Chain-of-Thought ===")
	prompt = prompting.ChainOfThought(
		"A train leaves City A at 9:00 AM traveling at 60 km/h. Another train leaves City B at 10:00 AM traveling at 80 km/h toward City A. Cities A and B are 280 km apart. At what time do the trains meet?",
	)
	resp, err = llms.GenerateFromSinglePrompt(ctx, model, prompt)
	if err != nil {
		log.Fatalf("CoT failed: %v", err)
	}
	fmt.Println(resp)

	// 4. Structured Output
	fmt.Println("\n=== Structured Output (JSON) ===")
	prompt = prompting.StructuredOutput(
		"Extract the key information from: 'John Smith, age 32, works as a software engineer at Google in Mountain View, CA'",
		`{"name": "string", "age": "number", "job_title": "string", "company": "string", "location": "string"}`,
	)
	resp, err = llms.GenerateFromSinglePrompt(ctx, model, prompt)
	if err != nil {
		log.Fatalf("Structured output failed: %v", err)
	}
	fmt.Println(resp)
}
