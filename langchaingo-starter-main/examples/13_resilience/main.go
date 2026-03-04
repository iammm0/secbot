// Example 13: Resilience Pattern - 异常处理与恢复
//
// 演示重试、指数退避、回退模型、超时控制和降级响应。
// 用法: go run ./examples/13_resilience/
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/resilience"

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

	fmt.Println("=== Resilience Pattern ===")
	fmt.Println("Demonstrating retry, fallback, and degraded mode.")
	fmt.Println()

	// Scenario 1: Normal operation with resilience wrapper
	fmt.Println("--- Scenario 1: Normal Operation ---")
	resilientLLM := resilience.NewResilientLLM(
		model,
		resilience.WithMaxRetries(2),
		resilience.WithTimeout(30*time.Second),
		resilience.WithBaseDelay(500*time.Millisecond),
		resilience.WithVerboseResilience(true),
	)

	result, err := resilientLLM.Generate(ctx, "What is 2 + 2? Answer with just the number.")
	if err != nil {
		log.Printf("Failed: %v", err)
	} else {
		fmt.Printf("Result: %s\n\n", result)
	}

	// Scenario 2: With fallback model
	fmt.Println("--- Scenario 2: With Fallback Model ---")
	fmt.Println("(Using same model as fallback for demo; in production use a different/cheaper model)")
	resilientWithFallback := resilience.NewResilientLLM(
		model,
		resilience.WithFallback(model),
		resilience.WithMaxRetries(1),
		resilience.WithTimeout(30*time.Second),
		resilience.WithVerboseResilience(true),
	)

	result, err = resilientWithFallback.Generate(ctx, "Name three programming languages. Be brief.")
	if err != nil {
		log.Printf("Failed: %v", err)
	} else {
		fmt.Printf("Result: %s\n\n", result)
	}

	// Scenario 3: With degraded message
	fmt.Println("--- Scenario 3: Degraded Mode ---")
	fmt.Println("(Simulating total failure with degraded fallback message)")
	degradedLLM := resilience.NewResilientLLM(
		model,
		resilience.WithMaxRetries(1),
		resilience.WithTimeout(30*time.Second),
		resilience.WithDegradedMessage("I'm sorry, our AI service is temporarily unavailable. Please try again later."),
		resilience.WithVerboseResilience(true),
	)

	result, err = degradedLLM.Generate(ctx, "Hello!")
	if err != nil {
		log.Printf("Even degraded mode failed: %v", err)
	} else {
		fmt.Printf("Result: %s\n", result)
	}
}
