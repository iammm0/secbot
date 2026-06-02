package config

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
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
	DatabaseURL string
}

func Load() *Config {
	persisted := loadPersistedConfigs()
	llmProvider := envOrDefault("LLM_PROVIDER", "deepseek")
	if v := persistedConfigValue(persisted, "llm_provider"); v != "" {
		llmProvider = v
	}

	cfg := &Config{
		LLMProvider: llmProvider,
		ModelName:   envOrDefault("MODEL_NAME", "deepseek-chat"),
		APIKey:      os.Getenv("DEEPSEEK_API_KEY"),
		BaseURL:     os.Getenv("DEEPSEEK_BASE_URL"),
		OllamaURL:   envOrDefault("OLLAMA_URL", "http://localhost:11434"),
		Temperature: envFloatOrDefault("TEMPERATURE", 0.7),
		MaxTokens:   envIntOrDefault("MAX_TOKENS", 4096),
		Verbose:     envBoolOrDefault("VERBOSE", false),
		LogLevel:    envOrDefault("LOG_LEVEL", "INFO"),
		LogFile:     envOrDefault("LOG_FILE", "logs/agent.log"),
		DatabaseURL: envOrDefault("DATABASE_URL", "data/secbot.db"),
	}

	provider := strings.ToLower(cfg.LLMProvider)

	switch provider {
	case "deepseek":
		if cfg.BaseURL == "" {
			cfg.BaseURL = "https://api.deepseek.com/v1"
		}
		if key := os.Getenv("DEEPSEEK_API_KEY"); key != "" {
			cfg.APIKey = normalizeAPIKey(key)
		}
		if model := os.Getenv("DEEPSEEK_MODEL"); model != "" {
			cfg.ModelName = model
		}
	case "openai":
		if key := os.Getenv("OPENAI_API_KEY"); key != "" {
			cfg.APIKey = normalizeAPIKey(key)
		}
		if url := os.Getenv("OPENAI_BASE_URL"); url != "" {
			cfg.BaseURL = url
		}
	case "ollama":
		if model := os.Getenv("OLLAMA_MODEL"); model != "" {
			cfg.ModelName = model
		}
	default:
		envKey := strings.ToUpper(provider) + "_API_KEY"
		if key := os.Getenv(envKey); key != "" {
			cfg.APIKey = normalizeAPIKey(key)
		}
		envURL := strings.ToUpper(provider) + "_BASE_URL"
		if url := os.Getenv(envURL); url != "" {
			cfg.BaseURL = url
		}
		envModel := strings.ToUpper(provider) + "_MODEL"
		if model := os.Getenv(envModel); model != "" {
			cfg.ModelName = model
		}
	}

	applyPersistedProviderConfig(cfg, persisted)
	return cfg
}

func (c *Config) Validate() error {
	provider := strings.ToLower(c.LLMProvider)
	if provider != "ollama" && c.APIKey == "" {
		return fmt.Errorf("provider %q 需要配置 API Key (设置 %s_API_KEY 环境变量)", c.LLMProvider, strings.ToUpper(c.LLMProvider))
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

func applyPersistedProviderConfig(cfg *Config, persisted map[string]string) {
	if len(persisted) == 0 {
		return
	}
	provider := strings.ToLower(strings.TrimSpace(cfg.LLMProvider))
	if provider == "" {
		return
	}
	if key := persistedConfigValue(persisted, provider+"_api_key"); key != "" {
		cfg.APIKey = normalizeAPIKey(key)
	}
	if baseURL := persistedConfigValue(persisted, provider+"_base_url"); baseURL != "" {
		cfg.BaseURL = strings.TrimRight(baseURL, "/")
	}
	if model := persistedConfigValue(persisted, provider+"_model"); model != "" {
		cfg.ModelName = model
	}
}

func persistedConfigValue(configs map[string]string, key string) string {
	if len(configs) == 0 {
		return ""
	}
	return strings.TrimSpace(configs[strings.ToLower(key)])
}

func loadPersistedConfigs() map[string]string {
	for _, dbPath := range candidateConfigDBPaths() {
		configs := readUserConfigs(dbPath)
		if len(configs) > 0 {
			return configs
		}
	}
	return nil
}

func readUserConfigs(dbPath string) map[string]string {
	if dbPath == "" {
		return nil
	}
	if _, err := os.Stat(dbPath); err != nil {
		return nil
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil
	}
	defer db.Close()

	rows, err := db.Query(`SELECT key, value FROM user_configs`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	configs := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		value = strings.TrimSpace(value)
		if key != "" && value != "" {
			configs[key] = value
		}
	}
	return configs
}

func candidateConfigDBPaths() []string {
	raw := []string{
		os.Getenv("SECBOT_RELEASE_CONFIG_DB"),
		sqlitePathFromDatabaseURL(os.Getenv("DATABASE_URL")),
		"data/secbot.db",
		"hackbot_config/data/secbot.db",
		"../secbot-pypi-release/hackbot_config/data/secbot.db",
		"../secbot-pypi-release/data/secbot.db",
	}

	seen := make(map[string]bool)
	paths := make([]string, 0, len(raw))
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		clean := filepath.Clean(p)
		if seen[clean] {
			continue
		}
		seen[clean] = true
		paths = append(paths, clean)
	}
	return paths
}

func sqlitePathFromDatabaseURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	switch {
	case strings.HasPrefix(raw, "sqlite:///"):
		return strings.TrimPrefix(raw, "sqlite:///")
	case strings.HasPrefix(raw, "sqlite://"):
		return strings.TrimPrefix(raw, "sqlite://")
	default:
		return raw
	}
}

func normalizeAPIKey(key string) string {
	key = strings.TrimSpace(key)
	if strings.HasPrefix(strings.ToLower(key), "bearer ") {
		return strings.TrimSpace(key[7:])
	}
	return key
}
