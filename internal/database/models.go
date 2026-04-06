package database

import "time"

type Conversation struct {
	ID        int64     `json:"id"`
	SessionID string    `json:"session_id"`
	AgentType string    `json:"agent_type"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	Metadata  string    `json:"metadata"`
}

type UserConfig struct {
	Key         string    `json:"key"`
	Value       string    `json:"value"`
	Category    string    `json:"category"`
	Description string    `json:"description"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type AuditRecord struct {
	ID        int64     `json:"id"`
	SessionID string    `json:"session_id"`
	AgentType string    `json:"agent_type"`
	StepType  string    `json:"step_type"`
	Content   string    `json:"content"`
	Metadata  string    `json:"metadata"`
	CreatedAt time.Time `json:"created_at"`
}

type ScanResult struct {
	ID        int64     `json:"id"`
	Target    string    `json:"target"`
	ScanType  string    `json:"scan_type"`
	Result    string    `json:"result"`
	Vulns     string    `json:"vulns"`
	CreatedAt time.Time `json:"created_at"`
}
