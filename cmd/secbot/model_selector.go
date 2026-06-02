package main

import (
	"bufio"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"secbot/config"
	"secbot/internal/database"

	_ "modernc.org/sqlite"
)

type providerSpec struct {
	ID             string
	Name           string
	Description    string
	DefaultBaseURL string
	DefaultModels  []string
	NeedsAPIKey    bool
	NeedsBaseURL   bool
}

type modelSelectionResult struct {
	Provider string
	Model    string
	BaseURL  string
	Saved    bool
}

var providerRegistry = []providerSpec{
	{ID: "ollama", Name: "Ollama (本地)", Description: "本地运行，无需 API Key", DefaultBaseURL: "http://localhost:11434", DefaultModels: []string{"qwen2.5:7b", "gemma3:1b"}},
	{ID: "deepseek", Name: "DeepSeek", Description: "深度求索，推理模型首选", DefaultBaseURL: "https://api.deepseek.com/v1", DefaultModels: []string{"deepseek-chat", "deepseek-reasoner"}, NeedsAPIKey: true},
	{ID: "openai", Name: "OpenAI", Description: "GPT / o 系列", DefaultBaseURL: "https://api.openai.com/v1", DefaultModels: []string{"gpt-4o", "gpt-4o-mini", "o1"}, NeedsAPIKey: true},
	{ID: "groq", Name: "Groq", Description: "高速推理，Llama/Gemma 等", DefaultBaseURL: "https://api.groq.com/openai/v1", DefaultModels: []string{"llama-3.3-70b-versatile", "llama-3.1-8b-instant"}, NeedsAPIKey: true},
	{ID: "openrouter", Name: "OpenRouter", Description: "一站式多模型聚合", DefaultBaseURL: "https://openrouter.ai/api/v1", DefaultModels: []string{"meta-llama/llama-3.2-3b-instruct:free", "google/gemma-2-9b-it:free"}, NeedsAPIKey: true},
	{ID: "zhipu", Name: "智谱 (GLM)", Description: "GLM-4 系列", DefaultBaseURL: "https://open.bigmodel.cn/api/paas/v4", DefaultModels: []string{"glm-4-flash", "glm-4", "glm-4-plus"}, NeedsAPIKey: true},
	{ID: "qwen", Name: "通义千问 (Qwen)", Description: "阿里云百炼兼容模式", DefaultBaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", DefaultModels: []string{"qwen-turbo", "qwen-plus", "qwen-max"}, NeedsAPIKey: true},
	{ID: "moonshot", Name: "月之暗面 (Kimi)", Description: "Moonshot AI", DefaultBaseURL: "https://api.moonshot.cn/v1", DefaultModels: []string{"moonshot-v1-8k", "moonshot-v1-32k"}, NeedsAPIKey: true},
	{ID: "together", Name: "Together AI", Description: "开源模型推理", DefaultBaseURL: "https://api.together.xyz/v1", DefaultModels: []string{"meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"}, NeedsAPIKey: true},
	{ID: "fireworks", Name: "Fireworks AI", Description: "高速开源模型推理", DefaultBaseURL: "https://api.fireworks.ai/inference/v1", DefaultModels: []string{"accounts/fireworks/models/llama-v3p1-70b-instruct", "accounts/fireworks/models/qwen-2.5-7b-instruct"}, NeedsAPIKey: true},
	{ID: "mistral", Name: "Mistral AI", Description: "Mistral / Codestral 系列", DefaultBaseURL: "https://api.mistral.ai/v1", DefaultModels: []string{"mistral-large-latest", "mistral-medium-latest", "codestral-latest"}, NeedsAPIKey: true},
	{ID: "cohere", Name: "Cohere", Description: "Command 系列", DefaultBaseURL: "https://api.cohere.ai/compatibility/v1", DefaultModels: []string{"command-r-plus", "command-r", "command"}, NeedsAPIKey: true},
	{ID: "hunyuan", Name: "腾讯混元", Description: "腾讯云混元 OpenAI 兼容", DefaultBaseURL: "https://api.hunyuan.cloud.tencent.com/v1", DefaultModels: []string{"hunyuan-turbos-latest", "hunyuan-lite", "hunyuan-pro"}, NeedsAPIKey: true},
	{ID: "doubao", Name: "字节豆包", Description: "火山方舟，模型名可填 Endpoint ID", DefaultBaseURL: "https://ark.cn-beijing.volces.com/api/v3", DefaultModels: []string{"doubao-pro-4k", "doubao-seed-1-8-251228", "ep-xxx"}, NeedsAPIKey: true},
	{ID: "spark", Name: "讯飞星火", Description: "星火认知大模型", DefaultBaseURL: "https://spark-api-open.xf-yun.com/v1", DefaultModels: []string{"generalv3.5", "generalv3", "spark-x"}, NeedsAPIKey: true},
	{ID: "wenxin", Name: "百度文心", Description: "百度千帆 OpenAI 兼容", DefaultBaseURL: "https://qianfan.baidubce.com/v2", DefaultModels: []string{"ernie-3.5-8k", "ernie-4.0-8k", "ernie-speed"}, NeedsAPIKey: true},
	{ID: "stepfun", Name: "阶跃星辰", Description: "Step 系列大模型", DefaultBaseURL: "https://api.stepfun.com/v1", DefaultModels: []string{"step-1-8k", "step-1-32k", "step-2-16k"}, NeedsAPIKey: true},
	{ID: "minimax", Name: "MiniMax", Description: "海螺等模型", DefaultBaseURL: "https://api.minimax.io/v1", DefaultModels: []string{"MiniMax-M2.5", "MiniMax-M2.5-highspeed"}, NeedsAPIKey: true},
	{ID: "scnet", Name: "中国超算互联网", Description: "AI Hub，QwQ / DeepSeek-R1 等", DefaultBaseURL: "https://api.scnet.cn/api/llm/v1", DefaultModels: []string{"QwQ-32B", "DeepSeek-R1-Distill-Qwen-7B", "DeepSeek-R1"}, NeedsAPIKey: true},
	{ID: "custom", Name: "OpenAI 兼容中转", Description: "自定义 API 兼容服务", NeedsAPIKey: true, NeedsBaseURL: true},
}

func findProviderSpec(id string) (providerSpec, bool) {
	id = strings.ToLower(strings.TrimSpace(id))
	for _, p := range providerRegistry {
		if p.ID == id {
			return p, true
		}
	}
	return providerSpec{}, false
}

func defaultModelForProvider(provider string) string {
	spec, ok := findProviderSpec(provider)
	if !ok || len(spec.DefaultModels) == 0 {
		return ""
	}
	return spec.DefaultModels[0]
}

func runModelSelector(cfg *config.Config, in io.Reader, out io.Writer) (*modelSelectionResult, error) {
	if cfg == nil {
		cfg = config.Load()
	}
	reader := bufio.NewReader(in)
	fmt.Fprintln(out, "选择模型后端")
	fmt.Fprintln(out, "============")
	for i, spec := range providerRegistry {
		fmt.Fprintf(out, "%2d. %-12s %-18s %s\n", i+1, spec.ID, spec.Name, providerStatus(cfg, spec))
	}
	fmt.Fprintf(out, "\n当前: %s / %s\n", cfg.LLMProvider, cfg.ModelName)
	fmt.Fprintf(out, "输入序号或 provider id，直接回车取消: ")

	choice, err := readPromptLine(reader)
	if err != nil {
		return nil, err
	}
	if choice == "" {
		fmt.Fprintln(out, "已取消模型切换。")
		return &modelSelectionResult{}, nil
	}

	spec, ok := resolveProviderChoice(choice)
	if !ok {
		return nil, fmt.Errorf("无效 provider: %s", choice)
	}

	dbPath := sqlitePathFromDatabaseURLLocal(cfg.DatabaseURL)
	apiKey := currentProviderConfigValue(dbPath, spec.ID+"_api_key")
	if apiKey == "" {
		apiKey = os.Getenv(strings.ToUpper(spec.ID) + "_API_KEY")
	}
	if spec.NeedsAPIKey && strings.TrimSpace(apiKey) == "" {
		fmt.Fprintf(out, "%s API Key: ", spec.ID)
		apiKey, err = readPromptLine(reader)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(apiKey) == "" {
			fmt.Fprintln(out, "未输入 API Key，已取消。")
			return &modelSelectionResult{}, nil
		}
	}
	apiKey = normalizeCLIAPIKey(apiKey)

	baseURL := currentProviderConfigValue(dbPath, spec.ID+"_base_url")
	if spec.ID == "ollama" {
		baseURL = currentProviderConfigValue(dbPath, "ollama_base_url")
	}
	if baseURL == "" {
		baseURL = os.Getenv(strings.ToUpper(spec.ID) + "_BASE_URL")
	}
	if spec.ID == "ollama" && baseURL == "" {
		baseURL = envFirstLocal("OLLAMA_URL", "OLLAMA_BASE_URL")
	}
	if baseURL == "" {
		baseURL = spec.DefaultBaseURL
	}
	if spec.NeedsBaseURL && strings.TrimSpace(baseURL) == "" {
		fmt.Fprint(out, "BASE_URL: ")
		baseURL, err = readPromptLine(reader)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(baseURL) == "" {
			fmt.Fprintln(out, "未输入 Base URL，已取消。")
			return &modelSelectionResult{}, nil
		}
	}
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")

	if len(spec.DefaultModels) > 0 {
		fmt.Fprintf(out, "常用模型: %s\n", strings.Join(spec.DefaultModels, ", "))
	}
	defaultModel := currentProviderConfigValue(dbPath, spec.ID+"_model")
	if defaultModel == "" {
		defaultModel = os.Getenv(strings.ToUpper(spec.ID) + "_MODEL")
	}
	if defaultModel == "" {
		defaultModel = defaultModelForProvider(spec.ID)
	}
	if defaultModel == "" {
		defaultModel = cfg.ModelName
	}
	fmt.Fprintf(out, "输入模型名（直接回车使用 %s）: ", defaultModel)
	modelName, err := readPromptLine(reader)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(modelName) == "" {
		modelName = defaultModel
	}

	if err := saveModelSelection(cfg.DatabaseURL, spec, apiKey, baseURL, modelName); err != nil {
		return nil, err
	}
	fmt.Fprintf(out, "已切换推理后端: %s，模型: %s\n", spec.ID, modelName)
	fmt.Fprintln(out, "新配置将在下次创建 Session 时生效。")
	return &modelSelectionResult{Provider: spec.ID, Model: modelName, BaseURL: baseURL, Saved: true}, nil
}

func resolveProviderChoice(choice string) (providerSpec, bool) {
	choice = strings.TrimSpace(choice)
	if idx, err := strconv.Atoi(choice); err == nil {
		if idx >= 1 && idx <= len(providerRegistry) {
			return providerRegistry[idx-1], true
		}
		return providerSpec{}, false
	}
	return findProviderSpec(choice)
}

func readPromptLine(reader *bufio.Reader) (string, error) {
	line, err := reader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

func providerStatus(cfg *config.Config, spec providerSpec) string {
	switch {
	case spec.ID == "ollama":
		if ollamaReachable(cfg.OllamaURL) {
			return "服务正常"
		}
		return "未检测到服务"
	case spec.NeedsAPIKey:
		dbPath := sqlitePathFromDatabaseURLLocal(cfg.DatabaseURL)
		if currentProviderConfigValue(dbPath, spec.ID+"_api_key") != "" || os.Getenv(strings.ToUpper(spec.ID)+"_API_KEY") != "" {
			return "已配置"
		}
		return "未配置"
	default:
		return "可用"
	}
}

func ollamaReachable(baseURL string) bool {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	client := &http.Client{Timeout: 800 * time.Millisecond}
	resp, err := client.Get(baseURL + "/api/tags")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func saveModelSelection(databaseURL string, spec providerSpec, apiKey, baseURL, modelName string) error {
	dbPath := sqlitePathFromDatabaseURLLocal(databaseURL)
	m, err := database.NewManager(dbPath)
	if err != nil {
		return err
	}
	defer m.Close()

	if err := m.SaveConfig("llm_provider", spec.ID, "user_preference", "当前推理后端（由 /model 或 secbot model 设置）"); err != nil {
		return err
	}
	if spec.NeedsAPIKey {
		if err := m.SaveConfig(spec.ID+"_api_key", normalizeCLIAPIKey(apiKey), "api_keys", spec.Name+" API Key"); err != nil {
			return err
		}
	}
	if spec.ID == "ollama" {
		if strings.TrimSpace(baseURL) != "" {
			if err := m.SaveConfig("ollama_base_url", baseURL, "api_keys", "Ollama Base URL"); err != nil {
				return err
			}
		}
	} else if strings.TrimSpace(baseURL) != "" {
		if err := m.SaveConfig(spec.ID+"_base_url", baseURL, "api_keys", spec.Name+" Base URL"); err != nil {
			return err
		}
	}
	if strings.TrimSpace(modelName) != "" {
		if err := m.SaveConfig(spec.ID+"_model", strings.TrimSpace(modelName), "user_preference", spec.Name+" 用户选择的模型"); err != nil {
			return err
		}
	}
	return nil
}

func currentProviderConfigValue(dbPath, key string) string {
	dbPath = strings.TrimSpace(dbPath)
	if dbPath == "" {
		return ""
	}
	if _, err := os.Stat(dbPath); err != nil {
		return ""
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return ""
	}
	defer db.Close()

	var value string
	if err := db.QueryRow(`SELECT value FROM user_configs WHERE key = ?`, strings.ToLower(key)).Scan(&value); err != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func sqlitePathFromDatabaseURLLocal(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return filepath.Clean("data/secbot.db")
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

func normalizeCLIAPIKey(key string) string {
	key = strings.TrimSpace(key)
	if strings.HasPrefix(strings.ToLower(key), "bearer ") {
		return strings.TrimSpace(key[7:])
	}
	return key
}

func envFirstLocal(keys ...string) string {
	for _, key := range keys {
		if v := os.Getenv(key); v != "" {
			return v
		}
	}
	return ""
}
