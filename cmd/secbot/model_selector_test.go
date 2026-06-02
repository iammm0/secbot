package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"secbot/config"
)

func TestProviderRegistryCanResolveEveryProvider(t *testing.T) {
	for _, spec := range providerRegistry {
		got, ok := findProviderSpec(spec.ID)
		if !ok {
			t.Fatalf("provider %q was not resolvable", spec.ID)
		}
		if got.ID != spec.ID {
			t.Fatalf("resolved provider id = %q, want %q", got.ID, spec.ID)
		}
		if spec.NeedsBaseURL && spec.DefaultBaseURL != "" {
			t.Fatalf("provider %q needs explicit base URL but has default %q", spec.ID, spec.DefaultBaseURL)
		}
	}
}

func TestRunModelSelectorCancelDoesNotCreateDatabase(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "secbot.db")
	cfg := &config.Config{
		LLMProvider: "ollama",
		ModelName:   "qwen2.5:7b",
		OllamaURL:   "http://127.0.0.1:1",
		DatabaseURL: dbPath,
	}

	var out bytes.Buffer
	result, err := runModelSelector(cfg, strings.NewReader("\n"), &out)
	if err != nil {
		t.Fatalf("runModelSelector: %v", err)
	}
	if result == nil || result.Saved {
		t.Fatalf("result saved = %v, want false", result != nil && result.Saved)
	}
	if _, err := os.Stat(dbPath); !os.IsNotExist(err) {
		t.Fatalf("database file exists after cancel: %v", err)
	}
	if value := currentProviderConfigValue(dbPath, "llm_provider"); value != "" {
		t.Fatalf("llm_provider = %q, want empty", value)
	}
}

func TestRunModelSelectorSavesDeepSeekConfig(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "secbot.db")
	cfg := &config.Config{
		LLMProvider: "ollama",
		ModelName:   "qwen2.5:7b",
		OllamaURL:   "http://127.0.0.1:1",
		DatabaseURL: dbPath,
	}

	var out bytes.Buffer
	result, err := runModelSelector(cfg, strings.NewReader("deepseek\nBearer sk-test\ndeepseek-reasoner\n"), &out)
	if err != nil {
		t.Fatalf("runModelSelector: %v", err)
	}
	if result == nil || !result.Saved {
		t.Fatalf("result saved = %v, want true", result != nil && result.Saved)
	}

	assertConfigValue(t, dbPath, "llm_provider", "deepseek")
	assertConfigValue(t, dbPath, "deepseek_api_key", "sk-test")
	assertConfigValue(t, dbPath, "deepseek_base_url", "https://api.deepseek.com/v1")
	assertConfigValue(t, dbPath, "deepseek_model", "deepseek-reasoner")
}

func assertConfigValue(t *testing.T, dbPath, key, want string) {
	t.Helper()
	if got := currentProviderConfigValue(dbPath, key); got != want {
		t.Fatalf("%s = %q, want %q", key, got, want)
	}
}
