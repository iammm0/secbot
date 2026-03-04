package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	LLMProvider string
	ModelName   string
	APIKey      string
	BaseURL     string
	OllamaURL   string
	Temperature float64
	MaxTokens   int
	Verbose     bool
	LogLevel    string
	LogFile     string
}

func Load() *Config {
	cfg := &Config{
		LLMProvider: envOrDefault("LLM_PROVIDER", "deepseek"),
		ModelName:   envOrDefault("MODEL_NAME", "deepseek-chat"),
		APIKey:      os.Getenv("DEEPSEEK_API_KEY"),
		BaseURL:     os.Getenv("DEEPSEEK_BASE_URL"),
		OllamaURL:   envOrDefault("OLLAMA_URL", "http://localhost:11434"),
		Temperature: envFloatOrDefault("TEMPERATURE", 0.7),
		MaxTokens:   envIntOrDefault("MAX_TOKENS", 4096),
		Verbose:     envBoolOrDefault("VERBOSE", false),
		LogLevel:    envOrDefault("LOG_LEVEL", "INFO"),
		LogFile:     envOrDefault("LOG_FILE", "logs/agent.log"),
	}

	switch strings.ToLower(cfg.LLMProvider) {
	case "deepseek":
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://api.deepseek.com/v1"
		}
		if key := os.Getenv("DEEPSEEK_API_KEY"); key != "" {
			cfg.APIKey = key
		}
	case "openai":
		if key := os.Getenv("OPENAI_API_KEY"); key != "" {
			cfg.APIKey = key
		}
		if url := os.Getenv("OPENAI_BASE_URL"); url != "" {
			cfg.BaseURL = url
		}
	case "ollama":
		if model := os.Getenv("OLLAMA_MODEL"); model != "" {
			cfg.ModelName = model
		}
	}

	return cfg
}

func (c *Config) Validate() error {
	valid := map[string]bool{"openai": true, "ollama": true, "deepseek": true}
	provider := strings.ToLower(c.LLMProvider)
	if !valid[provider] {
		return fmt.Errorf("不支持的 LLM_PROVIDER: %q（支持: openai, ollama, deepseek）", c.LLMProvider)
	}
	if provider != "ollama" && c.APIKey == "" {
		return fmt.Errorf("provider %q 需要配置 API Key", c.LLMProvider)
	}
	return nil
}

func (c *Config) String() string {
	key := c.APIKey
	if len(key) > 8 {
		key = key[:4] + "..." + key[len(key)-4:]
	} else if key != "" {
		key = "***"
	}
	return fmt.Sprintf("Config{provider=%s, model=%s, key=%s, temp=%.1f, max_tokens=%d}",
		c.LLMProvider, c.ModelName, key, c.Temperature, c.MaxTokens)
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envFloatOrDefault(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}

func envIntOrDefault(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return def
}

func envBoolOrDefault(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}
