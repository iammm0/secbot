package models

import "time"

type RequestType string

const (
	RequestGreeting  RequestType = "greeting"
	RequestSimple    RequestType = "simple"
	RequestTechnical RequestType = "technical"
	RequestQA        RequestType = "qa"
	RequestOther     RequestType = "other"
)

type TodoStatus string

const (
	TodoPending    TodoStatus = "pending"
	TodoInProgress TodoStatus = "in_progress"
	TodoCompleted  TodoStatus = "completed"
	TodoFailed     TodoStatus = "failed"
)

type TodoItem struct {
	ID            string     `json:"id"`
	Content       string     `json:"content"`
	Status        TodoStatus `json:"status"`
	DependsOn     []string   `json:"depends_on,omitempty"`
	ToolHint      string     `json:"tool_hint,omitempty"`
	Resource      string     `json:"resource,omitempty"`
	RiskLevel     string     `json:"risk_level,omitempty"`
	AgentHint     string     `json:"agent_hint,omitempty"`
	ResultSummary string     `json:"result_summary,omitempty"`
}

type PlanResult struct {
	RequestType    RequestType `json:"request_type"`
	PlanSummary    string      `json:"plan_summary"`
	DirectResponse string      `json:"direct_response,omitempty"`
	Todos          []TodoItem  `json:"todos"`
	ToolsRequired  []string    `json:"tools_required,omitempty"`
}

type InteractionSummary struct {
	RawReport         string   `json:"raw_report"`
	TaskSummary       string   `json:"task_summary"`
	TodoCompletion    string   `json:"todo_completion"`
	KeyFindings       []string `json:"key_findings"`
	Recommendations   []string `json:"recommendations"`
	OverallConclusion string   `json:"overall_conclusion"`
}

type MessageRole string

const (
	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
	RoleSystem    MessageRole = "system"
)

type SessionMessage struct {
	Role      MessageRole
	Content   string
	Summary   string
	Timestamp time.Time
}

type Session struct {
	ID        string
	Name      string
	AgentType string
	Messages  []SessionMessage
	CreatedAt time.Time
}

func NewSession(agentType string) *Session {
	return &Session{
		AgentType: agentType,
		CreatedAt: time.Now(),
		Messages:  make([]SessionMessage, 0),
	}
}

func (s *Session) AddMessage(role MessageRole, content string) {
	s.Messages = append(s.Messages, SessionMessage{
		Role:      role,
		Content:   content,
		Timestamp: time.Now(),
	})
}

type ToolResult struct {
	Tool    string `json:"tool"`
	Success bool   `json:"success"`
	Result  any    `json:"result,omitempty"`
	Error   string `json:"error,omitempty"`
}

type EventCallback func(eventType string, data map[string]any)

type ProcessOptions struct {
	OnEvent          EventCallback
	SkipPlanning     bool
	SkipReport       bool
	Todos            []map[string]any
	GetRootPassword  func(command string) (map[string]any, error)
	ForceQA          bool
	ForceAgentFlow   bool
	AgentType        string
}
