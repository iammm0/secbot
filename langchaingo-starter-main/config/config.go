package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all configuration for the application.
type Config struct {
	// LLM Provider: openai | anthropic | ollama | deepseek | googleai
	LLMProvider string
	// Model name (provider-specific)
	ModelName string
	// API key for the chosen provider
	APIKey string
	// Base URL for OpenAI-compatible APIs (DeepSeek, etc.)
	BaseURL string
	// Ollama server URL
	OllamaURL string
	// Google API key (separate because googleai uses a different env var)
	GoogleAPIKey string
	// Generation temperature
	Temperature float64
	// Max tokens for generation
	MaxTokens int
	// Enable verbose logging
	Verbose bool
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	cfg := &Config{
		LLMProvider:  envOrDefault("LLM_PROVIDER", "openai"),
		ModelName:    envOrDefault("MODEL_NAME", "gpt-4o"),
		APIKey:       os.Getenv("OPENAI_API_KEY"),
		BaseURL:      os.Getenv("BASE_URL"),
		OllamaURL:    envOrDefault("OLLAMA_URL", "http://localhost:11434"),
		GoogleAPIKey: os.Getenv("GOOGLE_API_KEY"),
		Temperature:  envFloatOrDefault("TEMPERATURE", 0.7),
		MaxTokens:    envIntOrDefault("MAX_TOKENS", 2048),
		Verbose:      envBoolOrDefault("VERBOSE", false),
	}

	// Resolve API key based on provider
	switch strings.ToLower(cfg.LLMProvider) {
	case "anthropic":
		if key := os.Getenv("ANTHROPIC_API_KEY"); key != "" {
			cfg.APIKey = key
		}
	case "googleai":
		if cfg.GoogleAPIKey != "" {
			cfg.APIKey = cfg.GoogleAPIKey
		}
	case "deepseek":
		// DeepSeek uses OpenAI-compatible API
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://api.deepseek.com/v1"
		}
		if cfg.ModelName == "gpt-4o" {
			cfg.ModelName = "deepseek-chat"
		}
	}

	return cfg
}

// Validate checks that the config has the minimum required fields.
func (c *Config) Validate() error {
	validProviders := map[string]bool{
		"openai": true, "anthropic": true, "ollama": true,
		"deepseek": true, "googleai": true,
	}
	provider := strings.ToLower(c.LLMProvider)
	if !validProviders[provider] {
		return fmt.Errorf("unsupported LLM_PROVIDER: %q (supported: openai, anthropic, ollama, deepseek, googleai)", c.LLMProvider)
	}
	if provider != "ollama" && c.APIKey == "" {
		return fmt.Errorf("API key is required for provider %q", c.LLMProvider)
	}
	return nil
}

// String returns a redacted string representation.
func (c *Config) String() string {
	key := c.APIKey
	if len(key) > 8 {
		key = key[:4] + "..." + key[len(key)-4:]
	} else if key != "" {
		key = "***"
	}
	return fmt.Sprintf("Config{provider=%s, model=%s, key=%s, temp=%.1f, max_tokens=%d, verbose=%v}",
		c.LLMProvider, c.ModelName, key, c.Temperature, c.MaxTokens, c.Verbose)
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func envFloatOrDefault(key string, defaultVal float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return defaultVal
}

func envIntOrDefault(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return defaultVal
}

func envBoolOrDefault(key string, defaultVal bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return defaultVal
}
