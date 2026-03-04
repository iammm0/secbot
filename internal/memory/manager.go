package memory

import (
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

type Manager struct {
	conversation *Store // 短期对话记忆
	context      *Store // 长期上下文
}

func NewManager() *Manager {
	return &Manager{
		conversation: NewStore(50),
		context:      NewStore(200),
	}
}

func (m *Manager) AddUserMessage(content string) {
	m.conversation.Add(RoleUser, content)
}

func (m *Manager) AddAssistantMessage(content string) {
	m.conversation.Add(RoleAssistant, content)
}

func (m *Manager) AddToolResult(toolName, result string) {
	m.conversation.AddWithMeta(RoleTool, result, map[string]any{"tool": toolName})
}

func (m *Manager) AddSystemContext(content string) {
	m.context.Add(RoleSystem, content)
}

// ToLLMMessages 将记忆转换为 langchaingo 的消息格式
func (m *Manager) ToLLMMessages(systemPrompt string) []llms.MessageContent {
	msgs := make([]llms.MessageContent, 0)

	if systemPrompt != "" {
		msgs = append(msgs, llms.TextParts(llms.ChatMessageTypeSystem, systemPrompt))
	}

	for _, msg := range m.conversation.All() {
		switch msg.Role {
		case RoleUser:
			msgs = append(msgs, llms.TextParts(llms.ChatMessageTypeHuman, msg.Content))
		case RoleAssistant:
			msgs = append(msgs, llms.TextParts(llms.ChatMessageTypeAI, msg.Content))
		case RoleTool:
			msgs = append(msgs, llms.TextParts(llms.ChatMessageTypeHuman,
				fmt.Sprintf("[工具结果] %s", msg.Content)))
		}
	}

	return msgs
}

func (m *Manager) GetContextSummary() string {
	var sb strings.Builder
	recent := m.conversation.Recent(10)
	for _, msg := range recent {
		sb.WriteString(fmt.Sprintf("[%s] %s\n", msg.Role, truncate(msg.Content, 200)))
	}
	return sb.String()
}

func (m *Manager) ConversationLen() int {
	return m.conversation.Len()
}

func (m *Manager) Clear() {
	m.conversation.Clear()
	m.context.Clear()
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
