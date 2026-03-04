package memory

import (
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/memory"
	"github.com/tmc/langchaingo/schema"
)

// Type represents the type of memory to create.
type Type string

const (
	TypeBuffer       Type = "buffer"        // Full conversation history
	TypeWindow       Type = "window"        // Sliding window of last N exchanges
	TypeTokenBuffer  Type = "token_buffer"  // Token-limited buffer
)

// Options configures memory creation.
type Options struct {
	Type       Type
	WindowSize int       // For TypeWindow: number of exchanges to keep
	MaxTokens  int       // For TypeTokenBuffer: max token count
	LLM        llms.Model // For TypeTokenBuffer: needed for token counting
	HumanPrefix string
	AIPrefix    string
	MemoryKey   string
}

// DefaultOptions returns sensible default options.
func DefaultOptions() Options {
	return Options{
		Type:        TypeBuffer,
		WindowSize:  10,
		MaxTokens:   2000,
		HumanPrefix: "Human",
		AIPrefix:    "AI",
		MemoryKey:   "history",
	}
}

// New creates a new memory instance based on the options.
func New(opts Options) schema.Memory {
	switch opts.Type {
	case TypeWindow:
		return memory.NewConversationWindowBuffer(
			opts.WindowSize,
			memory.WithHumanPrefix(opts.HumanPrefix),
			memory.WithAIPrefix(opts.AIPrefix),
			memory.WithMemoryKey(opts.MemoryKey),
		)
	case TypeTokenBuffer:
		if opts.LLM != nil {
			return memory.NewConversationTokenBuffer(
				opts.LLM,
				opts.MaxTokens,
				memory.WithHumanPrefix(opts.HumanPrefix),
				memory.WithAIPrefix(opts.AIPrefix),
				memory.WithMemoryKey(opts.MemoryKey),
			)
		}
		// Fallback to buffer if no LLM provided
		return newBuffer(opts)
	default:
		return newBuffer(opts)
	}
}

func newBuffer(opts Options) schema.Memory {
	return memory.NewConversationBuffer(
		memory.WithHumanPrefix(opts.HumanPrefix),
		memory.WithAIPrefix(opts.AIPrefix),
		memory.WithMemoryKey(opts.MemoryKey),
	)
}

// NewSimpleBuffer creates a simple conversation buffer with defaults.
func NewSimpleBuffer() schema.Memory {
	return New(DefaultOptions())
}
