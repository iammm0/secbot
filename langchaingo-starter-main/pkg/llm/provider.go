package llm

import (
	"context"
	"fmt"
	"strings"

	"langchaingo-starter/config"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/anthropic"
	"github.com/tmc/langchaingo/llms/googleai"
	"github.com/tmc/langchaingo/llms/ollama"
	"github.com/tmc/langchaingo/llms/openai"
)

// NewLLM creates a new LLM instance based on the configuration.
func NewLLM(cfg *config.Config) (llms.Model, error) {
	return NewLLMWithContext(context.Background(), cfg)
}

// NewLLMWithContext creates a new LLM instance with a context (needed for some providers).
func NewLLMWithContext(ctx context.Context, cfg *config.Config) (llms.Model, error) {
	provider := strings.ToLower(cfg.LLMProvider)
	switch provider {
	case "openai":
		return newOpenAI(cfg)
	case "deepseek":
		return newDeepSeek(cfg)
	case "anthropic":
		return newAnthropic(cfg)
	case "ollama":
		return newOllama(cfg)
	case "googleai":
		return newGoogleAI(ctx, cfg)
	default:
		return nil, fmt.Errorf("unsupported LLM provider: %q", cfg.LLMProvider)
	}
}

func newOpenAI(cfg *config.Config) (llms.Model, error) {
	opts := []openai.Option{
		openai.WithModel(cfg.ModelName),
	}
	if cfg.APIKey != "" {
		opts = append(opts, openai.WithToken(cfg.APIKey))
	}
	if cfg.BaseURL != "" {
		opts = append(opts, openai.WithBaseURL(cfg.BaseURL))
	}
	return openai.New(opts...)
}

func newDeepSeek(cfg *config.Config) (llms.Model, error) {
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = "https://api.deepseek.com/v1"
	}
	opts := []openai.Option{
		openai.WithModel(cfg.ModelName),
		openai.WithBaseURL(baseURL),
	}
	if cfg.APIKey != "" {
		opts = append(opts, openai.WithToken(cfg.APIKey))
	}
	return openai.New(opts...)
}

func newAnthropic(cfg *config.Config) (llms.Model, error) {
	opts := []anthropic.Option{
		anthropic.WithModel(cfg.ModelName),
	}
	if cfg.APIKey != "" {
		opts = append(opts, anthropic.WithToken(cfg.APIKey))
	}
	return anthropic.New(opts...)
}

func newOllama(cfg *config.Config) (llms.Model, error) {
	opts := []ollama.Option{
		ollama.WithModel(cfg.ModelName),
	}
	if cfg.OllamaURL != "" {
		opts = append(opts, ollama.WithServerURL(cfg.OllamaURL))
	}
	return ollama.New(opts...)
}

func newGoogleAI(ctx context.Context, cfg *config.Config) (llms.Model, error) {
	opts := []googleai.Option{
		googleai.WithDefaultModel(cfg.ModelName),
	}
	if cfg.APIKey != "" {
		opts = append(opts, googleai.WithAPIKey(cfg.APIKey))
	}
	return googleai.New(ctx, opts...)
}
