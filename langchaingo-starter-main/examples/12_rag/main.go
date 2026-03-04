// Example 12: RAG (Retrieval-Augmented Generation) - 知识检索增强
//
// 演示完整的 RAG 流程：文档导入 -> 切分 -> 向量化 -> 检索 -> 生成。
// 用法: go run ./examples/12_rag/
package main

import (
	"context"
	"fmt"
	"log"

	"langchaingo-starter/config"
	"langchaingo-starter/pkg/llm"
	"langchaingo-starter/pkg/patterns/rag"

	"github.com/joho/godotenv"
	"github.com/tmc/langchaingo/schema"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	model, err := llm.NewLLM(cfg)
	if err != nil {
		log.Fatalf("Failed to create LLM: %v", err)
	}

	ctx := context.Background()

	fmt.Println("=== RAG Pipeline ===")
	fmt.Println("Using in-memory vector store with hash-based embeddings (demo mode)")
	fmt.Println()

	// Create RAG pipeline with simple embedder (for demo - use real embeddings in production)
	embedder := rag.NewSimpleEmbedder(128)
	pipeline := rag.NewRAGPipeline(model, embedder, 300, 3)

	// Ingest knowledge documents
	fmt.Println("--- Ingesting Documents ---")
	docs := []schema.Document{
		{
			PageContent: `Go (Golang) is a statically typed, compiled programming language designed at Google by Robert Griesemer, Rob Pike, and Ken Thompson. It was announced in November 2009 and version 1.0 was released in March 2012. Go provides excellent support for concurrent programming through goroutines (lightweight threads) and channels (typed conduits for communication between goroutines). The language is designed for simplicity, with a clean syntax and a small set of keywords.`,
			Metadata:    map[string]any{"source": "go-overview", "topic": "Go language"},
		},
		{
			PageContent: `Goroutines are Go's approach to lightweight concurrency. A goroutine is a function that runs concurrently with other goroutines in the same address space. They are multiplexed onto OS threads by the Go runtime scheduler. Starting a goroutine is as simple as using the 'go' keyword before a function call. Goroutines are very cheap - you can easily spawn thousands or even millions of them.`,
			Metadata:    map[string]any{"source": "go-concurrency", "topic": "goroutines"},
		},
		{
			PageContent: `Channels in Go provide a way for goroutines to communicate and synchronize. A channel is a typed conduit through which you can send and receive values. Channels can be buffered or unbuffered. Unbuffered channels synchronize the sender and receiver, while buffered channels allow sending without an immediate receiver up to the buffer capacity. The select statement allows waiting on multiple channel operations.`,
			Metadata:    map[string]any{"source": "go-channels", "topic": "channels"},
		},
		{
			PageContent: `LangChainGo is the Go implementation of the LangChain framework. It provides tools for building LLM-powered applications including chains, agents, memory, and vector stores. The framework supports multiple LLM providers including OpenAI, Anthropic, Ollama, and Google AI. Key features include prompt templates, sequential chains, agent executors, and callback handlers for observability.`,
			Metadata:    map[string]any{"source": "langchaingo-docs", "topic": "langchaingo"},
		},
		{
			PageContent: `The Go memory model specifies the conditions under which reads of a variable in one goroutine can be guaranteed to observe values produced by writes to the same variable in a different goroutine. The 'happens before' relation defines the partial order of memory operations. Synchronization primitives like mutexes, channels, and atomic operations establish happens-before relationships.`,
			Metadata:    map[string]any{"source": "go-memory-model", "topic": "memory model"},
		},
	}

	if err := pipeline.Ingest(ctx, docs); err != nil {
		log.Fatalf("Ingestion failed: %v", err)
	}
	fmt.Printf("Ingested %d documents (%d chunks in store)\n\n", len(docs), pipeline.Store.Size())

	// Query the knowledge base
	questions := []string{
		"What are goroutines and how do they work?",
		"How do channels work in Go?",
		"What is LangChainGo?",
	}

	for _, q := range questions {
		fmt.Printf("--- Question: %s ---\n", q)
		answer, sources, err := pipeline.QueryWithSources(ctx, q)
		if err != nil {
			log.Printf("Query failed: %v\n\n", err)
			continue
		}
		fmt.Printf("Answer: %s\n", answer)
		fmt.Printf("Sources (%d):\n", len(sources))
		for i, s := range sources {
			fmt.Printf("  [%d] score=%.3f | %s\n", i+1, s.Score, truncate(s.Content, 80))
		}
		fmt.Println()
	}
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}
