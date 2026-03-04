// Example 05: Reflection Pattern - 自我反思与迭代改进
//
// 演示生成 -> 评估 -> 改进的迭代循环，让 LLM 自我优化输出质量。
// 用法: go run ./examples/05_reflection/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/reflection"

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

	fmt.Println("=== Reflection Loop: Iterative Improvement ===")
	fmt.Println("Task: Write a concise explanation of Go's concurrency model")
	fmt.Println("Max iterations: 3, Target score: 0.85")
	fmt.Println()

	loop := reflection.NewReflectionLoop(model, model, 3, 0.85)
	result, err := loop.Run(ctx, "Write a clear and concise explanation (150 words) of Go's concurrency model including goroutines and channels. Target audience: developers new to Go.")
	if err != nil {
		log.Fatalf("Reflection loop failed: %v", err)
	}

	for _, iter := range result.Iterations {
		fmt.Printf("--- Round %d (Score: %.2f) ---\n", iter.Round, iter.Score)
		fmt.Printf("Output: %s\n", truncate(iter.Output, 200))
		fmt.Printf("Feedback: %s\n\n", truncate(iter.Feedback, 200))
	}

	fmt.Printf("=== Final Result (Converged: %v) ===\n", result.Converged)
	fmt.Println(result.FinalOutput)
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}
