package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"secbot/internal/contextmgr"
	"secbot/internal/models"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

const exploreSystemPrompt = `你是 secbot 的 ExploreAgent。你的唯一目标是在执行真正的安全任务前，用只读、低成本工具补全上下文，把关键事实写入会话上下文池。

硬性原则：
1. 绝对禁止修改、写入、破坏性或需要授权确认的操作。
2. 优先使用 cve_lookup、smart_search、page_extract，其次使用 deep_crawl、api_client、web_search、OSINT 只读工具。
3. 不要回答用户问题，不要执行任务，不要写报告，只补上下文。
4. 收集到关键事实就输出 Final Patch，不要无意义反复搜索。

当你需要工具时输出：
Thought: 需要补的事实 / 工具与参数
Action: {"tool":"tool_name","input":"传给工具的字符串"}

当你已经收集足够信息时输出：
Thought: 我已经收集足够信息
Final Patch: {
  "facts": [{"key":"短英文 id","value":"事实文本","priority":0.0-1.0,"ttl":"turn|session|persistent","tags":["..."]}],
  "pinned": ["原文字符串，可选"],
  "unresolved": ["仍然缺的关键信息"],
  "suggested_focus": ["关键词，小写"],
  "explore_summary": "一句话总结你做了什么"
}`

type ExploreStep struct {
	Iteration   int
	Kind        string
	Tool        string
	Observation string
	Thought     string
}

type ExploreResult struct {
	Patch contextmgr.Patch
	Steps []ExploreStep
}

type ExploreAgent struct {
	tools map[string]tools.Tool
	llm   llms.Model
}

func NewExploreAgent(llm llms.Model, toolMap map[string]tools.Tool) *ExploreAgent {
	safe := make(map[string]tools.Tool)
	for _, name := range []string{
		"cve_lookup",
		"page_extract",
		"smart_search",
		"web_search",
		"deep_crawl",
		"api_client",
		"dns_lookup",
		"whois",
		"ip_geo",
		"cert_transparency",
		"shodan_query",
		"virustotal",
	} {
		if t, ok := toolMap[name]; ok {
			safe[name] = t
		}
	}
	return &ExploreAgent{tools: safe, llm: llm}
}

func (e *ExploreAgent) Explore(ctx context.Context, userInput string, intent models.IntentDecision, contextBlock string) ExploreResult {
	if e.llm == nil {
		return e.exploreFallback(ctx, userInput, intent)
	}

	result := ExploreResult{}
	messages := []llms.MessageContent{
		llms.TextParts(llms.ChatMessageTypeSystem, exploreSystemPrompt),
		llms.TextParts(llms.ChatMessageTypeHuman, e.userPrompt(userInput, intent, contextBlock)),
	}

	for iteration := 1; iteration <= exploreMaxIterations(); iteration++ {
		resp, err := e.llm.GenerateContent(ctx, messages,
			llms.WithTemperature(0.2),
			llms.WithMaxTokens(2048),
		)
		if err != nil || len(resp.Choices) == 0 {
			fallback := e.exploreFallback(ctx, userInput, intent)
			fallback.Steps = append(result.Steps, fallback.Steps...)
			fallback.Patch.ExploreSummary = strings.TrimSpace("LLM 探索失败，已回退到规则探索。 " + fallback.Patch.ExploreSummary)
			return fallback
		}

		content := resp.Choices[0].Content
		result.Steps = append(result.Steps, ExploreStep{
			Iteration: iteration,
			Kind:      "thought",
			Thought:   content,
		})

		if patch, ok := e.extractPatch(content); ok {
			result.Patch = patch
			return result
		}

		action, ok := parseExploreAction(content)
		if !ok {
			messages = append(messages,
				llms.TextParts(llms.ChatMessageTypeAI, content),
				llms.TextParts(llms.ChatMessageTypeHuman, "上一步既没有 Action 也没有 Final Patch。请立即输出 Final Patch JSON；如果没有事实，facts 为空并说明 unresolved。"),
			)
			continue
		}

		tool := e.tools[strings.ToLower(action.Tool)]
		if tool == nil {
			observation := fmt.Sprintf("[错误] 未知或非只读工具: %s", action.Tool)
			result.Steps = append(result.Steps, ExploreStep{
				Iteration:   iteration,
				Kind:        "action_error",
				Tool:        action.Tool,
				Observation: observation,
			})
			messages = append(messages,
				llms.TextParts(llms.ChatMessageTypeAI, content),
				llms.TextParts(llms.ChatMessageTypeHuman, "Observation: "+observation),
			)
			continue
		}

		observation, err := tool.Call(ctx, action.Input)
		if err != nil {
			observation = "[异常] " + err.Error()
		}
		observation = truncateRunes(observation, 2000)
		result.Steps = append(result.Steps, ExploreStep{
			Iteration:   iteration,
			Kind:        "action_result",
			Tool:        action.Tool,
			Observation: observation,
		})
		messages = append(messages,
			llms.TextParts(llms.ChatMessageTypeAI, content),
			llms.TextParts(llms.ChatMessageTypeHuman, "Observation: "+observation),
		)
	}

	messages = append(messages, llms.TextParts(llms.ChatMessageTypeHuman, "已达到最大迭代次数。请立即输出 Final Patch JSON。"))
	resp, err := e.llm.GenerateContent(ctx, messages, llms.WithTemperature(0.1), llms.WithMaxTokens(1600))
	if err == nil && len(resp.Choices) > 0 {
		if patch, ok := e.extractPatch(resp.Choices[0].Content); ok {
			result.Patch = patch
			return result
		}
	}

	result.Patch.Unresolved = append(result.Patch.Unresolved, "ExploreAgent 未能给出有效的 Patch")
	result.Patch.ExploreSummary = "explore failed"
	return result
}

func (e *ExploreAgent) exploreFallback(ctx context.Context, userInput string, intent models.IntentDecision) ExploreResult {
	targets := mergeTargets(intent.Focus, contextmgr.ExtractFocusKeywords(userInput))
	if len(targets) == 0 {
		targets = []string{userInput}
	}
	if len(targets) > 4 {
		targets = targets[:4]
	}

	result := ExploreResult{}
	for _, target := range targets {
		toolName := e.pickTool(target)
		tool := e.tools[toolName]
		if tool == nil {
			result.Patch.Unresolved = append(result.Patch.Unresolved, fmt.Sprintf("缺少只读探索工具: %s", toolName))
			continue
		}
		iteration := len(result.Steps) + 1
		thought := fmt.Sprintf("只读探索 %s，补充执行前上下文。", target)
		observation, err := tool.Call(ctx, target)
		if err != nil {
			observation = err.Error()
			result.Patch.Unresolved = append(result.Patch.Unresolved, fmt.Sprintf("%s 探索失败: %s", target, err.Error()))
		}
		preview := truncateRunes(observation, 1800)
		result.Steps = append(result.Steps, ExploreStep{
			Iteration:   iteration,
			Kind:        "tool",
			Tool:        toolName,
			Thought:     thought,
			Observation: preview,
		})
		if strings.TrimSpace(preview) != "" && err == nil {
			content := fmt.Sprintf("探索目标: %s\n工具: %s\n观察:\n%s", target, toolName, preview)
			result.Patch.Facts = append(result.Patch.Facts, contextmgr.ContextItem{
				ID:             fmt.Sprintf("explore-%d-%d", iteration, time.Now().UnixNano()),
				Content:        content,
				Source:         "explore",
				Priority:       0.9,
				TokensEstimate: contextmgr.ApproxTokens(content),
				CreatedAt:      time.Now(),
			})
		}
	}
	result.Patch.ExploreSummary = fmt.Sprintf("完成 %d 个只读探索步骤，得到 %d 条事实。", len(result.Steps), len(result.Patch.Facts))
	return result
}

func (e *ExploreAgent) userPrompt(userInput string, intent models.IntentDecision, contextBlock string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "用户原始请求：%s\n", userInput)
	fmt.Fprintf(&sb, "路由层意图：%s（%s）\n", intent.Intent, intent.Rationale)
	if len(intent.Focus) > 0 {
		fmt.Fprintf(&sb, "路由层 focus：%s\n", strings.Join(intent.Focus, ", "))
	}
	if strings.TrimSpace(contextBlock) != "" {
		fmt.Fprintf(&sb, "已注入上下文：\n%s\n", contextBlock)
	}
	sb.WriteString("可用只读工具：\n")
	for _, tool := range e.tools {
		fmt.Fprintf(&sb, "- %s: %s\n", tool.Name(), tool.Description())
	}
	fmt.Fprintf(&sb, "\n请按 ReAct 循环工作，最多 %d 轮。完成后必须输出 Final Patch JSON。", exploreMaxIterations())
	return sb.String()
}

func (e *ExploreAgent) extractPatch(text string) (contextmgr.Patch, bool) {
	match := regexp.MustCompile(`(?is)Final\s*Patch\s*:\s*(\{.*\})`).FindStringSubmatch(text)
	if len(match) < 2 {
		return contextmgr.Patch{}, false
	}
	var raw struct {
		Facts []struct {
			Key      string   `json:"key"`
			Value    string   `json:"value"`
			Priority float64  `json:"priority"`
			TTL      string   `json:"ttl"`
			Tags     []string `json:"tags"`
		} `json:"facts"`
		Pinned         []string `json:"pinned"`
		Unresolved     []string `json:"unresolved"`
		SuggestedFocus []string `json:"suggested_focus"`
		ExploreSummary string   `json:"explore_summary"`
	}
	if err := json.Unmarshal([]byte(match[1]), &raw); err != nil {
		return contextmgr.Patch{}, false
	}

	patch := contextmgr.Patch{
		Unresolved:     trimStringList(raw.Unresolved, 16),
		SuggestedFocus: trimStringList(raw.SuggestedFocus, 12),
		ExploreSummary: strings.TrimSpace(raw.ExploreSummary),
	}
	for i, fact := range raw.Facts {
		key := strings.TrimSpace(fact.Key)
		value := strings.TrimSpace(fact.Value)
		if key == "" || value == "" {
			continue
		}
		priority := fact.Priority
		if priority <= 0 {
			priority = 0.7
		}
		if priority > 1 {
			priority = 1
		}
		content := fmt.Sprintf("%s: %s", key, value)
		patch.Facts = append(patch.Facts, contextmgr.ContextItem{
			ID:             fmt.Sprintf("explore-fact-%d-%d", i, time.Now().UnixNano()),
			Content:        content,
			Source:         "explore",
			Priority:       priority,
			TokensEstimate: contextmgr.ApproxTokens(content),
			CreatedAt:      time.Now(),
		})
	}
	for i, pinned := range trimStringList(raw.Pinned, 16) {
		patch.Pinned = append(patch.Pinned, contextmgr.ContextItem{
			ID:             fmt.Sprintf("explore-pin-%d-%d", i, time.Now().UnixNano()),
			Content:        pinned,
			Source:         "explore",
			Priority:       0.85,
			TokensEstimate: contextmgr.ApproxTokens(pinned),
			CreatedAt:      time.Now(),
		})
	}
	return patch, true
}

func (e *ExploreAgent) pickTool(target string) string {
	lower := strings.ToLower(strings.TrimSpace(target))
	switch {
	case regexp.MustCompile(`(?i)^cve-\d{4}-\d{4,}$`).MatchString(lower):
		return "cve_lookup"
	case strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "https://"):
		return "page_extract"
	case looksLikeDomain(lower):
		if _, ok := e.tools["smart_search"]; ok {
			return "smart_search"
		}
		return "web_search"
	default:
		if _, ok := e.tools["smart_search"]; ok {
			return "smart_search"
		}
		return "web_search"
	}
}

func mergeTargets(groups ...[]string) []string {
	seen := map[string]bool{}
	out := make([]string, 0)
	for _, group := range groups {
		for _, raw := range group {
			item := strings.TrimSpace(strings.ToLower(raw))
			if item == "" || seen[item] {
				continue
			}
			seen[item] = true
			out = append(out, item)
		}
	}
	return out
}

func looksLikeDomain(value string) bool {
	return regexp.MustCompile(`^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}$`).MatchString(value)
}

func truncateRunes(text string, max int) string {
	if max <= 0 {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= max {
		return text
	}
	return string(runes[:max]) + "...(已截断)"
}

type exploreAction struct {
	Tool  string `json:"tool"`
	Input string `json:"input"`
}

func parseExploreAction(text string) (exploreAction, bool) {
	match := regexp.MustCompile(`(?is)Action\s*:\s*(\{.*?\})`).FindStringSubmatch(text)
	if len(match) >= 2 {
		var action exploreAction
		if err := json.Unmarshal([]byte(match[1]), &action); err == nil {
			action.Tool = strings.TrimSpace(strings.ToLower(action.Tool))
			action.Input = strings.TrimSpace(action.Input)
			return action, action.Tool != "" && action.Input != ""
		}
	}

	lines := strings.Split(text, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(strings.ToLower(line), "action:") {
			continue
		}
		rest := strings.TrimSpace(line[len("Action:"):])
		if idx := strings.Index(rest, "("); idx > 0 && strings.HasSuffix(rest, ")") {
			return exploreAction{
				Tool:  strings.TrimSpace(strings.ToLower(rest[:idx])),
				Input: strings.TrimSpace(strings.TrimSuffix(rest[idx+1:], ")")),
			}, true
		}
	}
	return exploreAction{}, false
}

func exploreMaxIterations() int {
	raw := strings.TrimSpace(os.Getenv("SECBOT_EXPLORE_MAX_ITERS"))
	if raw == "" {
		return 12
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return 12
	}
	if n > 40 {
		return 40
	}
	return n
}

func trimStringList(items []string, limit int) []string {
	out := make([]string, 0, len(items))
	seen := map[string]bool{}
	for _, raw := range items {
		item := strings.TrimSpace(raw)
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
		if len(out) >= limit {
			break
		}
	}
	return out
}
