package memoryctl

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/memory"
	"github.com/tmc/langchaingo/schema"
)

// MemoryManager implements a three-tier memory architecture:
// - ShortTerm: Full recent conversation buffer
// - MidTerm: Sliding window of the last N exchanges
// - LongTerm: LLM-summarized long-term memory
type MemoryManager struct {
	mu        sync.Mutex
	ShortTerm schema.Memory
	MidTerm   schema.Memory
	LLM       llms.Model // Used for long-term summarization
	summaries []string   // Long-term summarized knowledge
}

// NewMemoryManager creates a three-tier memory manager.
func NewMemoryManager(llm llms.Model, windowSize int) *MemoryManager {
	return &MemoryManager{
		ShortTerm: memory.NewConversationBuffer(),
		MidTerm: memory.NewConversationWindowBuffer(
			windowSize,
			memory.WithMemoryKey("history"),
		),
		LLM:       llm,
		summaries: make([]string, 0),
	}
}

// Remember stores a conversation turn across all memory tiers.
func (m *MemoryManager) Remember(ctx context.Context, input, output string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	inputMap := map[string]any{"input": input}
	outputMap := map[string]any{"output": output}

	if err := m.ShortTerm.SaveContext(ctx, inputMap, outputMap); err != nil {
		return fmt.Errorf("short-term save failed: %w", err)
	}
	if err := m.MidTerm.SaveContext(ctx, inputMap, outputMap); err != nil {
		return fmt.Errorf("mid-term save failed: %w", err)
	}

	return nil
}

// Recall retrieves relevant context for a query by combining all memory tiers.
func (m *MemoryManager) Recall(ctx context.Context, query string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var parts []string

	// Long-term summaries
	if len(m.summaries) > 0 {
		parts = append(parts, fmt.Sprintf("Long-term memory:\n%s", strings.Join(m.summaries, "\n")))
	}

	// Mid-term window
	midVars, err := m.MidTerm.LoadMemoryVariables(ctx, map[string]any{"input": query})
	if err == nil {
		if history, ok := midVars["history"]; ok {
			h := fmt.Sprintf("%v", history)
			if h != "" {
				parts = append(parts, fmt.Sprintf("Recent conversation:\n%s", h))
			}
		}
	}

	if len(parts) == 0 {
		return "", nil
	}

	return strings.Join(parts, "\n\n---\n\n"), nil
}

// Summarize compresses the current short-term memory into a long-term summary.
// Call this periodically to prevent context from growing too large.
func (m *MemoryManager) Summarize(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Load full short-term history
	vars, err := m.ShortTerm.LoadMemoryVariables(ctx, map[string]any{})
	if err != nil {
		return fmt.Errorf("failed to load short-term memory: %w", err)
	}

	history, ok := vars["history"]
	if !ok {
		return nil
	}
	historyStr := fmt.Sprintf("%v", history)
	if strings.TrimSpace(historyStr) == "" {
		return nil
	}

	// Use LLM to summarize
	prompt := fmt.Sprintf(`Summarize the following conversation into key facts, decisions, and important context. Be concise but preserve critical information.

Conversation:
%s

Summary:`, historyStr)

	summary, err := llms.GenerateFromSinglePrompt(ctx, m.LLM, prompt,
		llms.WithTemperature(0.1),
	)
	if err != nil {
		return fmt.Errorf("summarization failed: %w", err)
	}

	m.summaries = append(m.summaries, summary)

	// Clear short-term memory after summarization
	m.ShortTerm = memory.NewConversationBuffer()

	return nil
}

// GetSummaries returns all long-term summaries.
func (m *MemoryManager) GetSummaries() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]string, len(m.summaries))
	copy(result, m.summaries)
	return result
}

// ChatWithMemory sends a message using the full memory context.
func (m *MemoryManager) ChatWithMemory(ctx context.Context, llm llms.Model, input string) (string, error) {
	// Recall context
	memoryContext, err := m.Recall(ctx, input)
	if err != nil {
		return "", fmt.Errorf("recall failed: %w", err)
	}

	var messages []llms.MessageContent
	if memoryContext != "" {
		messages = append(messages,
			llms.TextParts(llms.ChatMessageTypeSystem,
				fmt.Sprintf("You have the following memory context from previous interactions:\n\n%s\n\nUse this context to inform your responses when relevant.", memoryContext)),
		)
	}
	messages = append(messages, llms.TextParts(llms.ChatMessageTypeHuman, input))

	resp, err := llm.GenerateContent(ctx, messages)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no response")
	}

	output := resp.Choices[0].Content

	// Remember this exchange
	if err := m.Remember(ctx, input, output); err != nil {
		return output, fmt.Errorf("remember failed: %w", err)
	}

	return output, nil
}
