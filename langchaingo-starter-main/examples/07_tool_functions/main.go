// Example 07: Functions Agent - OpenAI Function Calling
//
// 演示使用 OpenAI 的 Tool Calling（Function Calling）进行结构化工具调用。
// 用法: go run ./examples/07_tool_functions/
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

	fmt.Println("=== OpenAI Functions Agent ===")
	fmt.Println("Agent uses structured tool calling for reliable tool invocation.")
	fmt.Println("Tools:", registry.Names())
	fmt.Println()

	agent := tooluse.NewFunctionCallAgent(
		model,
		registry.All(),
		tooluse.WithMaxIterations(5),
		tooluse.WithCallbacks(callback.NewLogHandler(cfg.Verbose)),
	)

	questions := []string{
		"What is the weather like in Tokyo?",
		"Search for information about LangChain and summarize it.",
		"Calculate (15 + 27) * 3",
	}

	for _, q := range questions {
		fmt.Printf("--- Question: %s ---\n", q)
		result, err := agent.Run(ctx, q)
		if err != nil {
			log.Printf("Failed: %v\n\n", err)
			continue
		}
		fmt.Printf("Answer: %s\n\n", result)
	}
}
