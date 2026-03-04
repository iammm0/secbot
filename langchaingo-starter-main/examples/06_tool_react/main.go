// Example 06: ReAct Agent - 思考-行动-观察循环
//
// 演示 ReAct (Reasoning + Acting) 模式，Agent 通过 Thought/Action/Observation 循环解决问题。
// 用法: go run ./examples/06_tool_react/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/callback"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/tooluse"
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

	fmt.Println("=== ReAct Agent ===")
	fmt.Println("Agent will reason through the problem using available tools.")
	fmt.Println("Tools:", registry.Names())
	fmt.Println()

	agent := tooluse.NewReActAgent(
		model,
		registry.All(),
		tooluse.WithReActMaxIterations(5),
		tooluse.WithReActCallbacks(callback.NewLogHandler(cfg.Verbose)),
	)

	input := "What is the weather in Beijing? Also calculate what 22 degrees Celsius is in Fahrenheit (formula: F = C * 9/5 + 32)."
	fmt.Printf("Question: %s\n\n", input)

	result, err := agent.Run(ctx, input)
	if err != nil {
		log.Fatalf("ReAct agent failed: %v", err)
	}

	fmt.Println("\n=== Final Answer ===")
	fmt.Println(result)
}
