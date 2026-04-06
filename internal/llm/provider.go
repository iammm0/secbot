package llm

import (
	"fmt"
	"os"
	"strings"

	"secbot/config"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/ollama"
	"github.com/tmc/langchaingo/llms/openai"
)

var providerBaseURLs = map[string]string{
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
	"xai":       "",
	"hunyuan":    "https://api.hunyuan.cloud.tencent.com/v1",
	"doubao":     "https://ark.cn-beijing.volces.com/api/v3",
	"spark":      "https://spark-api-open.xf-yun.com/v1",
	"wenxin":     "https://qianfan.baidubce.com/v2",
	"stepfun":    "https://api.stepfun.com/v1",
	"minimax":    "https://api.minimax.io/v1",
	"scnet":      "https://api.scnet.cn/api/llm/v1",
}

func NewLLM(cfg *config.Config) (llms.Model, error) {
	provider := strings.ToLower(cfg.LLMProvider)
	if provider == "ollama" {
		return newOllama(cfg)
	}
	return newOpenAICompatible(cfg, provider)
}

func newOpenAICompatible(cfg *config.Config, provider string) (llms.Model, error) {
	apiKey := cfg.APIKey
	if apiKey == "" {
		envKey := strings.ToUpper(provider) + "_API_KEY"
		apiKey = os.Getenv(envKey)
	}

	baseURL := cfg.BaseURL
	if baseURL == "" {
		if defaultURL, ok := providerBaseURLs[provider]; ok && defaultURL != "" {
			baseURL = defaultURL
		}
	}

	if apiKey == "" && provider != "ollama" {
		return nil, fmt.Errorf("provider %q 需要配置 API Key (设置 %s_API_KEY 环境变量)", provider, strings.ToUpper(provider))
	}

	opts := []openai.Option{openai.WithModel(cfg.ModelName)}
	if apiKey != "" {
		opts = append(opts, openai.WithToken(apiKey))
	}
	if baseURL != "" {
		opts = append(opts, openai.WithBaseURL(baseURL))
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

func SupportedProviders() []string {
	providers := []string{"ollama"}
	for k := range providerBaseURLs {
		providers = append(providers, k)
	}
	providers = append(providers, "custom")
	return providers
}
