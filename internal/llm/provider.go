package llm

import (
	"fmt"
	"strings"

	"secbot/config"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/ollama"
	"github.com/tmc/langchaingo/llms/openai"
)

func NewLLM(cfg *config.Config) (llms.Model, error) {
	provider := strings.ToLower(cfg.LLMProvider)
	switch provider {
	case "openai":
		return newOpenAI(cfg)
	case "deepseek":
		return newDeepSeek(cfg)
	case "ollama":
		return newOllama(cfg)
	default:
		return nil, fmt.Errorf("不支持的 LLM provider: %q", cfg.LLMProvider)
	}
}

func newOpenAI(cfg *config.Config) (llms.Model, error) {
	opts := []openai.Option{openai.WithModel(cfg.ModelName)}
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

func newOllama(cfg *config.Config) (llms.Model, error) {
	opts := []ollama.Option{ollama.WithModel(cfg.ModelName)}
	if cfg.OllamaURL != "" {
		opts = append(opts, ollama.WithServerURL(cfg.OllamaURL))
	}
	return ollama.New(opts...)
}
