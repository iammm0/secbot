package agent

import (
	"context"
	"strings"

	"secbot/internal/patterns"

	"github.com/tmc/langchaingo/llms"
)

type RequestType string

const (
	RequestGreeting  RequestType = "greeting"
	RequestQA        RequestType = "qa"
	RequestTechnical RequestType = "technical"
)

type IntentRouter struct {
	llm llms.Model
}

func NewIntentRouter(llm llms.Model) *IntentRouter {
	return &IntentRouter{llm: llm}
}

// Classify 使用 LLM 对用户输入进行意图分类
func (r *IntentRouter) Classify(ctx context.Context, input string) RequestType {
	// 规则路由：优先匹配明确模式
	lower := strings.ToLower(input)

	greetings := []string{"你好", "hello", "hi", "嗨", "hey", "早上好", "晚上好", "good morning"}
	for _, g := range greetings {
		if strings.Contains(lower, g) && len(input) < 20 {
			return RequestGreeting
		}
	}

	techKeywords := []string{
		"扫描", "scan", "渗透", "pentest", "漏洞", "vuln", "攻击", "exploit",
		"端口", "port", "dns", "whois", "ping", "nmap", "目标",
		"检测", "detect", "分析", "analyze", "安全", "security",
		"http", "ssl", "证书", "header", "web", "ip", "网络",
		"执行", "运行", "命令", "hash", "编码", "解码",
	}
	for _, kw := range techKeywords {
		if strings.Contains(lower, kw) {
			return RequestTechnical
		}
	}

	// LLM 路由作为后备
	router := patterns.NewRouter(r.llm, []patterns.RouteCategory{
		{Name: "technical", Description: "安全测试、网络扫描、渗透测试、系统命令等技术操作请求"},
		{Name: "qa", Description: "安全知识问答、概念解释、最佳实践咨询"},
		{Name: "greeting", Description: "打招呼、闲聊、问候"},
	}, nil)

	result, err := router.Route(ctx, input)
	if err != nil {
		return RequestQA
	}

	switch strings.ToLower(result.Category) {
	case "technical":
		return RequestTechnical
	case "greeting":
		return RequestGreeting
	default:
		return RequestQA
	}
}
