// Example 15: Evaluation Pattern - LLM-as-Judge 评估
//
// 演示使用 LLM 作为评判者对输出进行多维度评分和比较。
// 用法: go run ./examples/15_evaluation/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/evaluation"

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

	fmt.Println("=== Evaluation Pattern: LLM-as-Judge ===")
	fmt.Println()

	evaluator := evaluation.NewEvaluator(model, evaluation.DefaultCriteria())

	// Generate two outputs to compare
	question := "Explain what a goroutine is in Go."
	fmt.Printf("Question: %s\n\n", question)

	fmt.Println("Generating two different answers to compare...")

	outputA, err := llms.GenerateFromSinglePrompt(ctx, model,
		"Give a brief, simple explanation of goroutines in Go (50 words max).",
		llms.WithTemperature(0.3),
	)
	if err != nil {
		log.Fatalf("Generation A failed: %v", err)
	}

	outputB, err := llms.GenerateFromSinglePrompt(ctx, model,
		"Give a detailed technical explanation of goroutines in Go with examples (200 words).",
		llms.WithTemperature(0.7),
	)
	if err != nil {
		log.Fatalf("Generation B failed: %v", err)
	}

	fmt.Printf("--- Output A (brief) ---\n%s\n\n", outputA)
	fmt.Printf("--- Output B (detailed) ---\n%s\n\n", outputB)

	// Evaluate individually
	fmt.Println("=== Evaluating Output A ===")
	resultA, err := evaluator.Evaluate(ctx, question, outputA)
	if err != nil {
		log.Fatalf("Evaluation A failed: %v", err)
	}
	printResult("A", resultA)

	fmt.Println("\n=== Evaluating Output B ===")
	resultB, err := evaluator.Evaluate(ctx, question, outputB)
	if err != nil {
		log.Fatalf("Evaluation B failed: %v", err)
	}
	printResult("B", resultB)

	// Compare
	fmt.Println("\n=== Comparison ===")
	winner, _, _, err := evaluator.Compare(ctx, question, outputA, outputB)
	if err != nil {
		log.Fatalf("Comparison failed: %v", err)
	}
	fmt.Printf("Winner: %s (A=%.2f, B=%.2f)\n", winner, resultA.Overall, resultB.Overall)
}

func printResult(name string, result *evaluation.EvalResult) {
	fmt.Printf("Output %s Scores:\n", name)
	for criterion, score := range result.Scores {
		bar := makeBar(score, 20)
		fmt.Printf("  %-15s %s %.2f\n", criterion, bar, score)
	}
	fmt.Printf("  %-15s %.2f\n", "OVERALL:", result.Overall)
	if result.Reasoning != "" {
		fmt.Printf("  Reasoning: %s\n", truncate(result.Reasoning, 200))
	}
}

func makeBar(score float64, width int) string {
	filled := int(score * float64(width))
	bar := ""
	for i := 0; i < width; i++ {
		if i < filled {
			bar += "█"
		} else {
			bar += "░"
		}
	}
	return bar
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}
