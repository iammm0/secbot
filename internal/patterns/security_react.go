package patterns

import (
	"context"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

const securitySystemPrompt = `你是 SecBot，一名专业的安全测试机器人。你的开发者是赵明俊。

你的核心能力：
1. 使用安全工具执行渗透测试、漏洞扫描、网络侦察
2. 分析扫描结果并给出安全建议
3. 执行系统命令获取信息
4. 自动化安全评估流程

工作流程：
- 分析用户需求，拆分为可执行步骤
- 选择合适的工具执行每个步骤
- 分析结果，给出专业安全建议
- 支持中英文交互

安全原则：
- 仅在授权范围内进行测试
- 不执行破坏性操作
- 详细记录所有操作步骤`

// SecurityReActAgent 是安全测试专用的 ReAct agent，
// 它在 LLM 交互中注入安全专用的系统提示词
type SecurityReActAgent struct {
	LLM           llms.Model
	Tools         []tools.Tool
	MaxIterations int
	SystemPrompt  string
}

func NewSecurityReActAgent(llm llms.Model, toolList []tools.Tool, maxIter int) *SecurityReActAgent {
	if maxIter <= 0 {
		maxIter = 10
	}
	return &SecurityReActAgent{
		LLM:           llm,
		Tools:         toolList,
		MaxIterations: maxIter,
		SystemPrompt:  securitySystemPrompt,
	}
}

// Run 使用安全上下文执行 ReAct 循环
func (a *SecurityReActAgent) Run(ctx context.Context, input string) (string, error) {
	toolDescs := a.toolDescriptions()
	prompt := fmt.Sprintf(`%s

可用工具:
%s

用户请求: %s

请分析用户需求，按步骤使用合适的工具完成任务。每一步给出：
1. 思考（Thought）：分析当前情况
2. 行动（Action）：选择工具和参数
3. 观察（Observation）：分析工具返回结果

最终给出完整的分析报告。`, a.SystemPrompt, toolDescs, input)

	messages := []llms.MessageContent{
		llms.TextParts(llms.ChatMessageTypeSystem, a.SystemPrompt),
		llms.TextParts(llms.ChatMessageTypeHuman, prompt),
	}

	var fullResponse strings.Builder
	for i := 0; i < a.MaxIterations; i++ {
		resp, err := a.LLM.GenerateContent(ctx, messages,
			llms.WithTemperature(0.3),
			llms.WithMaxTokens(4096),
		)
		if err != nil {
			return fullResponse.String(), fmt.Errorf("LLM 调用失败: %w", err)
		}
		if len(resp.Choices) == 0 {
			break
		}

		content := resp.Choices[0].Content
		fullResponse.WriteString(content)
		fullResponse.WriteString("\n")

		// 检查是否有工具调用请求
		toolName, toolInput := parseToolCall(content)
		if toolName == "" {
			break // 没有工具调用，完成
		}

		toolResult, err := a.callTool(ctx, toolName, toolInput)
		if err != nil {
			toolResult = fmt.Sprintf("工具调用失败: %s", err)
		}

		fullResponse.WriteString(fmt.Sprintf("\n[工具结果 - %s]\n%s\n", toolName, toolResult))

		messages = append(messages,
			llms.TextParts(llms.ChatMessageTypeAI, content),
			llms.TextParts(llms.ChatMessageTypeHuman,
				fmt.Sprintf("工具 %s 的执行结果:\n%s\n\n请继续分析或给出最终结论。", toolName, toolResult)),
		)
	}

	return fullResponse.String(), nil
}

func (a *SecurityReActAgent) callTool(ctx context.Context, name, input string) (string, error) {
	for _, t := range a.Tools {
		if strings.EqualFold(t.Name(), name) {
			return t.Call(ctx, input)
		}
	}
	return "", fmt.Errorf("工具 %q 未找到", name)
}

func (a *SecurityReActAgent) toolDescriptions() string {
	var sb strings.Builder
	for _, t := range a.Tools {
		fmt.Fprintf(&sb, "- %s: %s\n", t.Name(), t.Description())
	}
	return sb.String()
}

// parseToolCall 从 LLM 响应中解析工具调用
// 支持格式：Action: ToolName(input) 或 [Tool: ToolName] input
func parseToolCall(content string) (name, input string) {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Action: ToolName(input)
		if strings.HasPrefix(line, "Action:") {
			rest := strings.TrimPrefix(line, "Action:")
			rest = strings.TrimSpace(rest)
			if idx := strings.Index(rest, "("); idx > 0 {
				name = strings.TrimSpace(rest[:idx])
				input = strings.Trim(rest[idx:], "()")
				return
			}
			// Action: ToolName\nAction Input: xxx
			name = rest
			continue
		}

		// Action Input: xxx
		if strings.HasPrefix(line, "Action Input:") && name != "" {
			input = strings.TrimSpace(strings.TrimPrefix(line, "Action Input:"))
			return
		}
	}
	return "", ""
}
