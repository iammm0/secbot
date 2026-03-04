// Example 09: Planning Pattern - 目标分解与执行
//
// 演示 LLM 将高层目标自动分解为结构化计划，然后按步骤执行。
// 用法: go run ./examples/09_planning/
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/planning"
	"langchaingo-starter/pkg/tools"

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
	registry := tools.DefaultRegistry()

	fmt.Println("=== Planning Pattern ===")
	fmt.Println("The planner will decompose a goal into steps and execute them.")
	fmt.Println()

	planner := planning.NewPlanner(model, registry.All(), 6)

	goal := "Find the weather in Beijing and Tokyo, calculate the average temperature, and tell me which city is warmer."
	fmt.Printf("Goal: %s\n\n", goal)

	// Step 1: Create the plan
	fmt.Println("--- Step 1: Creating Plan ---")
	plan, err := planner.CreatePlan(ctx, goal)
	if err != nil {
		log.Fatalf("Planning failed: %v", err)
	}

	planJSON, _ := json.MarshalIndent(plan, "", "  ")
	fmt.Println(string(planJSON))

	// Step 2: Execute the plan
	fmt.Println("\n--- Step 2: Executing Plan ---")
	result, err := planner.ExecutePlan(ctx, plan)
	if err != nil {
		log.Fatalf("Execution failed: %v", err)
	}

	for _, sr := range result.StepResults {
		status := "OK"
		if !sr.Success {
			status = "FAIL: " + sr.Error
		}
		fmt.Printf("[%s] %s: %s\n", sr.StepID, status, truncate(sr.Output, 150))
	}

	fmt.Println("\n=== Final Output ===")
	fmt.Println(result.FinalOutput)
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}
