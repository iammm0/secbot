// Example 11: Conversational Agent - 带记忆的多轮对话
//
// 演示三层记忆架构（短期/中期/长期）支持的有状态对话。
// 用法: go run ./examples/11_conversational/
package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/memoryctl"

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

	fmt.Println("=== Conversational Agent with Memory ===")
	fmt.Println("Three-tier memory: short-term buffer + mid-term window + long-term summary")
	fmt.Println("Commands: /summarize (compress memory), /memory (show state), /quit (exit)")
	fmt.Println()

	memMgr := memoryctl.NewMemoryManager(model, 5)
	scanner := bufio.NewScanner(os.Stdin)
	turnCount := 0

	for {
		fmt.Print("You: ")
		if !scanner.Scan() {
			break
		}
		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		switch input {
		case "/quit":
			fmt.Println("Goodbye!")
			return
		case "/summarize":
			fmt.Println("[System] Summarizing conversation to long-term memory...")
			if err := memMgr.Summarize(ctx); err != nil {
				fmt.Printf("[System] Error: %v\n", err)
			} else {
				fmt.Println("[System] Done. Short-term memory cleared, summary stored.")
			}
			continue
		case "/memory":
			fmt.Println("[System] Memory State:")
			summaries := memMgr.GetSummaries()
			if len(summaries) > 0 {
				for i, s := range summaries {
					fmt.Printf("  Long-term[%d]: %s\n", i, truncate(s, 200))
				}
			} else {
				fmt.Println("  Long-term: (empty)")
			}
			context, _ := memMgr.Recall(ctx, "")
			if context != "" {
				fmt.Printf("  Current context: %s\n", truncate(context, 300))
			}
			continue
		}

		response, err := memMgr.ChatWithMemory(ctx, model, input)
		if err != nil {
			fmt.Printf("[Error] %v\n", err)
			continue
		}

		fmt.Printf("AI: %s\n\n", response)
		turnCount++

		// Suggest summarization every 10 turns
		if turnCount%10 == 0 {
			fmt.Println("[System] Tip: Use /summarize to compress old conversations into long-term memory.")
		}
	}
}

func truncate(s string, maxLen int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}
