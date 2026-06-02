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
