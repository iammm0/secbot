// Example 01: Simple Chain - 最基础的 LLM Chain 调用
//
// 演示如何使用 SimpleChain 进行单步 LLM 调用。
// 用法: go run ./examples/01_simple_chain/
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
	if cfg.Verbose {
		fmt.Println("Config:", cfg)
	}

	model, err := llm.NewLLM(cfg)
	if err != nil {
		log.Fatalf("Failed to create LLM: %v", err)
	}

	ctx := context.Background()

	// Example 1: Translation chain
	fmt.Println("=== Simple Chain: Translation ===")
	translateChain := chaining.NewSimpleChain(
		model,
		"Translate the following text to {{.language}}:\n\n{{.text}}",
		[]string{"language", "text"},
	)

	result, err := translateChain.Call(ctx, map[string]any{
		"language": "French",
		"text":     "Hello, how are you today? The weather is beautiful.",
	})
	if err != nil {
		log.Fatalf("Translation failed: %v", err)
	}
	fmt.Println("Translation:", result["text"])

	// Example 2: Summarization with single input
	fmt.Println("\n=== Simple Chain: Summarization ===")
	summaryChain := chaining.NewSimpleChain(
		model,
		"Summarize the following text in 2-3 sentences:\n\n{{.text}}",
		[]string{"text"},
	)

	summary, err := summaryChain.Run(ctx, `Go is a statically typed, compiled programming language designed at Google. 
It is syntactically similar to C, but with memory safety, garbage collection, structural typing, and CSP-style concurrency. 
Go was designed to improve programming productivity in an era of multicore, networked machines and large codebases.
The language was announced in November 2009 and has since become one of the most popular languages for cloud infrastructure and DevOps tools.`)
	if err != nil {
		log.Fatalf("Summarization failed: %v", err)
	}
	fmt.Println("Summary:", summary)
}
