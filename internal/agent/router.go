package agent

import (
	"context"
	"strings"

	"secbot/internal/models"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
)

type IntentRouter struct {
	llm llms.Model
}

func NewIntentRouter(llm llms.Model) *IntentRouter {
	return &IntentRouter{llm: llm}
}

func (r *IntentRouter) Classify(ctx context.Context, input string) models.RequestType {
	lower := strings.ToLower(input)

	greetings := []string{"你好", "hello", "hi", "嗨", "hey", "早上好", "晚上好", "good morning"}
	for _, g := range greetings {
		if strings.Contains(lower, g) && len([]rune(input)) < 20 {
			return models.RequestGreeting
		}
	}

	techKeywords := []string{
		"扫描", "scan", "渗透", "pentest", "漏洞", "vuln", "攻击", "exploit",
		"端口", "port", "dns", "whois", "ping", "nmap", "目标",
		"检测", "detect", "分析", "analyze", "安全", "security",
		"http", "ssl", "证书", "header", "web", "ip", "网络",
		"执行", "运行", "命令", "hash", "编码", "解码",
		"巡检", "侦察", "recon", "信息收集", "子域名", "subdomain",
	}
	for _, kw := range techKeywords {
		if strings.Contains(lower, kw) {
			return models.RequestTechnical
		}
	}

	category := r.classifyWithLLM(ctx, input)
	switch category {
	case "technical":
		return models.RequestTechnical
	case "greeting":
		return models.RequestGreeting
	case "qa":
		return models.RequestQA
	default:
		return models.RequestOther
	}
}

func (r *IntentRouter) classifyWithLLM(ctx context.Context, input string) string {
	prompt := `将以下输入分类到恰好一个类别中：

- technical: 安全测试、网络扫描、渗透测试、系统命令等技术操作请求
- qa: 安全知识问答、概念解释、最佳实践咨询
- greeting: 打招呼、闲聊、问候
- other: 与安全或电脑无关的话题

输入: ` + input + `

仅回复类别名称（technical/qa/greeting/other），不要回复其他内容。`

	response, err := llms.GenerateFromSinglePrompt(ctx, r.llm, prompt,
		llms.WithTemperature(0.0),
		llms.WithMaxTokens(20),
	)
	if err != nil {
		logger.Warnf("[IntentRouter] LLM 分类失败: %v, 默认 qa", err)
		return "qa"
	}
	return strings.TrimSpace(strings.ToLower(response))
}
