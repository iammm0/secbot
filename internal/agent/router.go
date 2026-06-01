package agent

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"secbot/internal/models"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
)

type IntentRouter struct {
	llm llms.Model
}

type intentHeuristic struct {
	isSmallTalk      bool
	isMeta           bool
	isTask           bool
	hasUnknownEntity bool
	focus            []string
}

func NewIntentRouter(llm llms.Model) *IntentRouter {
	return &IntentRouter{llm: llm}
}

func (r *IntentRouter) Classify(ctx context.Context, input string) models.RequestType {
	decision := r.ClassifyDecision(ctx, input, nil, nil)
	switch decision.Intent {
	case models.IntentSmallTalk:
		return models.RequestGreeting
	case models.IntentMeta, models.IntentQA:
		return models.RequestQA
	case models.IntentClarifyNeeded:
		return models.RequestOther
	case models.IntentTaskSimple:
		return models.RequestSimple
	case models.IntentTaskComplex:
		return models.RequestTechnical
	default:
		return models.RequestOther
	}
}

func (r *IntentRouter) ClassifyDecision(
	ctx context.Context,
	input string,
	sessionFocus []string,
	unresolved []string,
) models.IntentDecision {
	h := r.heuristic(input)

	prompt := buildIntentPrompt(input, sessionFocus, unresolved)
	response, err := llms.GenerateFromSinglePrompt(ctx, r.llm, prompt,
		llms.WithTemperature(0.0),
		llms.WithMaxTokens(700),
	)
	if err == nil {
		if parsed, ok := parseIntentDecision(response); ok {
			return mergeIntentHeuristic(parsed, h, sessionFocus)
		}
	} else {
		logger.Warnf("[IntentRouter] LLM 分类失败，启发式回退: %v", err)
	}

	return fallbackIntent(h)
}

func buildIntentPrompt(input string, sessionFocus []string, unresolved []string) string {
	var b strings.Builder
	b.WriteString(`你是 secbot 的意图分类器。secbot 是一个授权范围内的安全自动化工作台。你只做意图分类，不直接执行任务，不要做任何安全操作。

分类（共 6 类）：
1) small_talk：闲聊、感谢、表情、确认（"嗯"/"ok"）、纯礼貌。不需要工具、不需要安全知识。
2) meta：询问 secbot 自身能力、改设置、查看历史/工具列表/会话状态。
3) qa：安全知识、概念、原理、提问类。通常不需要执行工具；但若用户明确在问“最新/近期/当前”的漏洞或安全动态，仍归为 qa，由问答层决定是否做只读实时检索。
4) clarify_needed：用户想做任务，但关键参数缺失（目标缺、模糊指代、范围不清），必须先追问。
5) task_simple：任务意图明确，且显然 1 步可解，跳过复杂规划。
6) task_complex：任务，需要规划、并行/串行多步工具调用、可能要生成报告。

附加字段：
- confidence：0-1
- needs_explore：true 表示在执行前应先做只读探索补上下文。
- needs_report：是否需要执行后产出结构化报告。task_simple 通常 false，task_complex 通常 true。
- focus：从输入抽出的实体（IP、域名、CVE、目标系统、协议等），不超过 8 个，小写。
- direct_response：small_talk / meta / qa 可填一句直接回复。
- clarify_question：clarify_needed 必填，一个具体的追问。
- rationale：一句话解释为什么这么分类。

严格 JSON 输出（不要 Markdown 代码块、不要多余文字）：
{"intent":"small_talk|meta|qa|clarify_needed|task_simple|task_complex","confidence":0.0,"needs_explore":false,"needs_report":false,"focus":[],"direct_response":null,"clarify_question":null,"rationale":""}

本轮用户输入：
`)
	b.WriteString(input)
	b.WriteString("\n")
	if len(sessionFocus) > 0 {
		b.WriteString("\n当前会话 focus（仅供参考）：")
		b.WriteString(strings.Join(sessionFocus, ", "))
		b.WriteString("\n")
	}
	if len(unresolved) > 0 {
		b.WriteString("\n当前会话未解决问题：")
		b.WriteString(strings.Join(unresolved, "; "))
		b.WriteString("\n")
	}
	b.WriteString("\n请严格按 JSON 输出。")
	return b.String()
}

func parseIntentDecision(raw string) (models.IntentDecision, bool) {
	obj := extractJSON(raw)
	var data struct {
		Intent          string   `json:"intent"`
		Confidence      float64  `json:"confidence"`
		NeedsExplore    bool     `json:"needs_explore"`
		NeedsReport     bool     `json:"needs_report"`
		Focus           []string `json:"focus"`
		DirectResponse  any      `json:"direct_response"`
		ClarifyQuestion any      `json:"clarify_question"`
		Rationale       string   `json:"rationale"`
	}
	if err := json.Unmarshal([]byte(obj), &data); err != nil {
		return models.IntentDecision{}, false
	}

	intent := models.Intent(data.Intent)
	switch intent {
	case models.IntentSmallTalk, models.IntentMeta, models.IntentQA, models.IntentClarifyNeeded, models.IntentTaskSimple, models.IntentTaskComplex:
	default:
		return models.IntentDecision{}, false
	}

	confidence := data.Confidence
	if confidence <= 0 {
		confidence = 0.5
	}
	if confidence > 1 {
		confidence = 1
	}

	return models.IntentDecision{
		Intent:          intent,
		Confidence:      confidence,
		NeedsExplore:    data.NeedsExplore,
		NeedsReport:     data.NeedsReport || intent == models.IntentTaskComplex,
		Focus:           normalizeStringList(data.Focus, 8),
		DirectResponse:  nullableString(data.DirectResponse),
		ClarifyQuestion: nullableString(data.ClarifyQuestion),
		Rationale:       data.Rationale,
	}, true
}

func mergeIntentHeuristic(decision models.IntentDecision, h intentHeuristic, sessionFocus []string) models.IntentDecision {
	seen := make(map[string]bool)
	merged := make([]string, 0, len(decision.Focus)+len(h.focus))
	for _, item := range append(decision.Focus, h.focus...) {
		item = strings.TrimSpace(strings.ToLower(item))
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		merged = append(merged, item)
		if len(merged) >= 12 {
			break
		}
	}
	decision.Focus = merged
	if !decision.NeedsExplore &&
		(decision.Intent == models.IntentTaskSimple || decision.Intent == models.IntentTaskComplex) &&
		h.hasUnknownEntity &&
		len(sessionFocus) == 0 {
		decision.NeedsExplore = true
	}
	return decision
}

func fallbackIntent(h intentHeuristic) models.IntentDecision {
	intent := models.IntentQA
	if h.isSmallTalk {
		intent = models.IntentSmallTalk
	} else if h.isMeta {
		intent = models.IntentMeta
	} else if h.isTask {
		intent = models.IntentTaskComplex
	}
	return models.IntentDecision{
		Intent:       intent,
		Confidence:   0.4,
		NeedsExplore: intent == models.IntentTaskComplex && h.hasUnknownEntity,
		NeedsReport:  intent == models.IntentTaskComplex,
		Focus:        h.focus,
		Rationale:    "fallback (heuristic)",
	}
}

func (r *IntentRouter) heuristic(text string) intentHeuristic {
	lower := strings.ToLower(strings.TrimSpace(text))

	smallTalkHints := []string{"你好", "嗨", "早上好", "下午好", "晚上好", "谢谢", "感谢", "辛苦", "ok", "hi", "hello", "hey", "可以"}
	metaHints := []string{"你是谁", "你能做什么", "你能干嘛", "secbot", "怎么设置", "改设置", "设置模型", "切换模型", "清空记忆", "历史记录", "工具列表", "当前会话", "会话 id"}
	taskHints := []string{"扫描", "渗透", "攻击", "检测", "探测", "枚举", "利用", "注入", "爆破", "提权", "嗅探", "scan", "exploit", "attack", "detect", "pentest", "enumerate", "brute", "inject"}

	h := intentHeuristic{}
	if len([]rune(lower)) <= 6 {
		for _, kw := range smallTalkHints {
			if strings.Contains(lower, kw) {
				h.isSmallTalk = true
				break
			}
		}
	}
	for _, kw := range metaHints {
		if strings.Contains(lower, kw) {
			h.isMeta = true
			break
		}
	}
	for _, kw := range taskHints {
		if strings.Contains(lower, kw) {
			h.isTask = true
			break
		}
	}

	patterns := []string{
		`\b\d{1,3}(?:\.\d{1,3}){3}\b`,
		`\bcve-\d{4}-\d{4,7}\b`,
		`\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b`,
		`https?://[^\s)>"']+`,
	}
	seen := map[string]bool{}
	for _, pat := range patterns {
		re := regexp.MustCompile("(?i)" + pat)
		for _, match := range re.FindAllString(text, -1) {
			item := strings.ToLower(match)
			if !seen[item] {
				seen[item] = true
				h.focus = append(h.focus, item)
				if len(h.focus) >= 8 {
					break
				}
			}
		}
	}
	h.hasUnknownEntity = len(h.focus) > 0
	return h
}

func normalizeStringList(items []string, max int) []string {
	out := make([]string, 0, len(items))
	seen := make(map[string]bool)
	for _, item := range items {
		item = strings.TrimSpace(strings.ToLower(item))
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
		if len(out) >= max {
			break
		}
	}
	return out
}

func nullableString(value any) string {
	s, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}
