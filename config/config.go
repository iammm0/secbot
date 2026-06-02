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

var providerDefaultBaseURLs = map[string]string{
	"deepseek":   "https://api.deepseek.com/v1",
	"openai":     "https://api.openai.com/v1",
	"groq":       "https://api.groq.com/openai/v1",
	"openrouter": "https://openrouter.ai/api/v1",
	"zhipu":      "https://open.bigmodel.cn/api/paas/v4",
	"qwen":       "https://dashscope.aliyuncs.com/compatible-mode/v1",
	"moonshot":   "https://api.moonshot.cn/v1",
	"together":   "https://api.together.xyz/v1",
	"fireworks":  "https://api.fireworks.ai/inference/v1",
	"mistral":    "https://api.mistral.ai/v1",
	"cohere":     "https://api.cohere.ai/compatibility/v1",
	"hunyuan":    "https://api.hunyuan.cloud.tencent.com/v1",
	"doubao":     "https://ark.cn-beijing.volces.com/api/v3",
	"spark":      "https://spark-api-open.xf-yun.com/v1",
	"wenxin":     "https://qianfan.baidubce.com/v2",
	"stepfun":    "https://api.stepfun.com/v1",
	"minimax":    "https://api.minimax.io/v1",
	"scnet":      "https://api.scnet.cn/api/llm/v1",
}

var providersRequiringBaseURL = map[string]bool{
	"custom":       true,
	"langboat":     true,
	"mianbi":       true,
	"xai":          true,
	"azure_openai": true,
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
		OllamaURL:   envFirstOrDefault([]string{"OLLAMA_URL", "OLLAMA_BASE_URL"}, "http://localhost:11434"),
		Temperature: envFloatOrDefault("TEMPERATURE", 0.7),
		MaxTokens:   envIntOrDefault("MAX_TOKENS", 4096),
		Verbose:     envBoolOrDefault("VERBOSE", false),
		LogLevel:    envOrDefault("LOG_LEVEL", "INFO"),
		LogFile:     envOrDefault("LOG_FILE", "logs/agent.log"),
		DatabaseURL: envOrDefault("DATABASE_URL", "data/secbot.db"),
	}

	provider := strings.ToLower(cfg.LLMProvider)

	applyEnvProviderConfig(cfg, provider)
	applyPersistedProviderConfig(cfg, persisted)
	return cfg
}

func (c *Config) Validate() error {
	provider := strings.ToLower(c.LLMProvider)
	if provider != "ollama" && c.APIKey == "" {
		return fmt.Errorf("provider %q 需要配置 API Key (设置 %s_API_KEY 环境变量)", c.LLMProvider, strings.ToUpper(c.LLMProvider))
	}
	if provider != "ollama" && c.BaseURL == "" && providersRequiringBaseURL[provider] {
		return fmt.Errorf("provider %q 需要配置 Base URL (设置 %s_BASE_URL 或通过 /model 保存)", c.LLMProvider, strings.ToUpper(c.LLMProvider))
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

func envFirstOrDefault(keys []string, def string) string {
	for _, key := range keys {
		if v := os.Getenv(key); v != "" {
			return v
		}
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

func applyEnvProviderConfig(cfg *Config, provider string) {
	envPrefix := strings.ToUpper(provider)
	switch provider {
	case "ollama":
		if url := envFirstOrDefault([]string{"OLLAMA_URL", "OLLAMA_BASE_URL"}, ""); url != "" {
			cfg.OllamaURL = strings.TrimRight(url, "/")
		}
		if model := os.Getenv("OLLAMA_MODEL"); model != "" {
			cfg.ModelName = model
		}
		return
	case "deepseek":
		if cfg.BaseURL == "" {
			cfg.BaseURL = providerDefaultBaseURLs[provider]
		}
	}

	if key := os.Getenv(envPrefix + "_API_KEY"); key != "" {
		cfg.APIKey = normalizeAPIKey(key)
	}
	if url := os.Getenv(envPrefix + "_BASE_URL"); url != "" {
		cfg.BaseURL = strings.TrimRight(url, "/")
	} else if cfg.BaseURL == "" {
		cfg.BaseURL = providerDefaultBaseURLs[provider]
	}
	if model := os.Getenv(envPrefix + "_MODEL"); model != "" {
		cfg.ModelName = model
	}
}

func applyPersistedProviderConfig(cfg *Config, persisted map[string]string) {
	if len(persisted) == 0 {
		return
	}
	provider := strings.ToLower(strings.TrimSpace(cfg.LLMProvider))
	if provider == "" {
		return
	}
	if provider == "ollama" {
		if baseURL := persistedConfigValue(persisted, "ollama_base_url"); baseURL != "" {
			cfg.OllamaURL = strings.TrimRight(baseURL, "/")
		}
		if model := persistedConfigValue(persisted, "ollama_model"); model != "" {
			cfg.ModelName = model
		}
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
