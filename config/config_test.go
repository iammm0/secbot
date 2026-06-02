package config

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestLoadReadsReleaseSQLiteConfig(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "secbot.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE user_configs (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			category TEXT DEFAULT '',
			description TEXT DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		INSERT INTO user_configs (key, value) VALUES
			('llm_provider', 'deepseek'),
			('deepseek_api_key', 'Bearer sk-release-test-key'),
			('deepseek_model', 'deepseek-reasoner'),
			('deepseek_base_url', 'https://api.deepseek.com/');
	`)
	if err != nil {
		t.Fatalf("seed sqlite config: %v", err)
	}

	t.Setenv("SECBOT_RELEASE_CONFIG_DB", dbPath)
	t.Setenv("LLM_PROVIDER", "ollama")
	t.Setenv("MODEL_NAME", "env-model")

	cfg := Load()
	if cfg.LLMProvider != "deepseek" {
		t.Fatalf("provider = %q, want deepseek", cfg.LLMProvider)
	}
	if cfg.APIKey != "sk-release-test-key" {
		t.Fatalf("api key was not loaded and normalized from sqlite")
	}
	if cfg.ModelName != "deepseek-reasoner" {
		t.Fatalf("model = %q, want deepseek-reasoner", cfg.ModelName)
	}
	if cfg.BaseURL != "https://api.deepseek.com" {
		t.Fatalf("base url = %q, want trimmed deepseek base url", cfg.BaseURL)
	}
}

func TestLoadMapsPersistedOllamaBaseURL(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "secbot.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE user_configs (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			category TEXT DEFAULT '',
			description TEXT DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		INSERT INTO user_configs (key, value) VALUES
			('llm_provider', 'ollama'),
			('ollama_base_url', 'http://127.0.0.1:11434/'),
			('ollama_model', 'qwen2.5:7b');
	`)
	if err != nil {
		t.Fatalf("seed sqlite config: %v", err)
	}

	t.Setenv("SECBOT_RELEASE_CONFIG_DB", dbPath)
	t.Setenv("OLLAMA_URL", "http://ignored:11434")

	cfg := Load()
	if cfg.LLMProvider != "ollama" {
		t.Fatalf("provider = %q, want ollama", cfg.LLMProvider)
	}
	if cfg.OllamaURL != "http://127.0.0.1:11434" {
		t.Fatalf("ollama url = %q, want persisted trimmed URL", cfg.OllamaURL)
	}
	if cfg.BaseURL != "" {
		t.Fatalf("base url = %q, want empty for ollama", cfg.BaseURL)
	}
	if cfg.ModelName != "qwen2.5:7b" {
		t.Fatalf("model = %q, want qwen2.5:7b", cfg.ModelName)
	}
}

func TestLoadSupportsOllamaBaseURLEnvAlias(t *testing.T) {
	t.Setenv("SECBOT_RELEASE_CONFIG_DB", filepath.Join(t.TempDir(), "missing.db"))
	t.Setenv("LLM_PROVIDER", "ollama")
	t.Setenv("OLLAMA_BASE_URL", "http://alias:11434")
	t.Setenv("OLLAMA_MODEL", "gemma3:1b")

	cfg := Load()
	if cfg.OllamaURL != "http://alias:11434" {
		t.Fatalf("ollama url = %q, want env alias", cfg.OllamaURL)
	}
	if cfg.ModelName != "gemma3:1b" {
		t.Fatalf("model = %q, want env ollama model", cfg.ModelName)
	}
}

func TestValidateRequiresCustomBaseURL(t *testing.T) {
	cfg := &Config{
		LLMProvider: "custom",
		ModelName:   "custom-model",
		APIKey:      "sk-test",
	}
	if err := cfg.Validate(); err == nil {
		t.Fatalf("Validate() returned nil, want missing Base URL error")
	}
}
