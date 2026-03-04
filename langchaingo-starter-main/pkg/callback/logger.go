package callback

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/schema"
)

// LogHandler implements callbacks.Handler with structured logging.
type LogHandler struct {
	Prefix  string
	Verbose bool
	start   time.Time
}

// NewLogHandler creates a new logging callback handler.
func NewLogHandler(verbose bool) *LogHandler {
	return &LogHandler{
		Prefix:  "[Agent]",
		Verbose: verbose,
	}
}

func (h *LogHandler) log(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	log.Printf("%s %s", h.Prefix, msg)
}

func (h *LogHandler) HandleText(_ context.Context, text string) {
	if h.Verbose {
		h.log("📝 Text: %s", truncate(text, 200))
	}
}

func (h *LogHandler) HandleLLMStart(_ context.Context, prompts []string) {
	h.start = time.Now()
	if h.Verbose {
		h.log("🚀 LLM Start | prompts=%d", len(prompts))
		for i, p := range prompts {
			h.log("  prompt[%d]: %s", i, truncate(p, 150))
		}
	} else {
		h.log("🚀 LLM Start")
	}
}

func (h *LogHandler) HandleLLMGenerateContentStart(_ context.Context, ms []llms.MessageContent) {
	h.start = time.Now()
	if h.Verbose {
		h.log("🚀 LLM GenerateContent Start | messages=%d", len(ms))
		for i, m := range ms {
			h.log("  msg[%d] role=%s parts=%d", i, m.Role, len(m.Parts))
		}
	} else {
		h.log("🚀 LLM GenerateContent Start | messages=%d", len(ms))
	}
}

func (h *LogHandler) HandleLLMGenerateContentEnd(_ context.Context, res *llms.ContentResponse) {
	elapsed := time.Since(h.start)
	if res != nil && len(res.Choices) > 0 {
		content := res.Choices[0].Content
		h.log("✅ LLM Done | %s | output=%s", elapsed.Round(time.Millisecond), truncate(content, 150))
	} else {
		h.log("✅ LLM Done | %s", elapsed.Round(time.Millisecond))
	}
}

func (h *LogHandler) HandleLLMError(_ context.Context, err error) {
	h.log("❌ LLM Error: %v", err)
}

func (h *LogHandler) HandleChainStart(_ context.Context, inputs map[string]any) {
	if h.Verbose {
		keys := make([]string, 0, len(inputs))
		for k := range inputs {
			keys = append(keys, k)
		}
		h.log("⛓️ Chain Start | keys=[%s]", strings.Join(keys, ", "))
	}
}

func (h *LogHandler) HandleChainEnd(_ context.Context, outputs map[string]any) {
	if h.Verbose {
		keys := make([]string, 0, len(outputs))
		for k := range outputs {
			keys = append(keys, k)
		}
		h.log("⛓️ Chain End | keys=[%s]", strings.Join(keys, ", "))
	}
}

func (h *LogHandler) HandleChainError(_ context.Context, err error) {
	h.log("❌ Chain Error: %v", err)
}

func (h *LogHandler) HandleToolStart(_ context.Context, input string) {
	h.log("🔧 Tool Start | input=%s", truncate(input, 150))
}

func (h *LogHandler) HandleToolEnd(_ context.Context, output string) {
	h.log("🔧 Tool End | output=%s", truncate(output, 150))
}

func (h *LogHandler) HandleToolError(_ context.Context, err error) {
	h.log("❌ Tool Error: %v", err)
}

func (h *LogHandler) HandleAgentAction(_ context.Context, action schema.AgentAction) {
	h.log("🤖 Agent Action | tool=%s input=%s", action.Tool, truncate(action.ToolInput, 100))
}

func (h *LogHandler) HandleAgentFinish(_ context.Context, finish schema.AgentFinish) {
	output := ""
	if v, ok := finish.ReturnValues["output"]; ok {
		output = fmt.Sprintf("%v", v)
	}
	h.log("🏁 Agent Finish | output=%s", truncate(output, 200))
}

func (h *LogHandler) HandleRetrieverStart(_ context.Context, query string) {
	h.log("🔍 Retriever Start | query=%s", truncate(query, 150))
}

func (h *LogHandler) HandleRetrieverEnd(_ context.Context, query string, documents []schema.Document) {
	h.log("🔍 Retriever End | query=%s docs=%d", truncate(query, 80), len(documents))
}

func (h *LogHandler) HandleStreamingFunc(_ context.Context, chunk []byte) {
	if h.Verbose {
		fmt.Print(string(chunk))
	}
}

func truncate(s string, maxLen int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}
