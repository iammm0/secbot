package event

import (
	"sync"
)

type Type string

const (
	AgentThinking  Type = "agent_thinking"
	AgentResponse  Type = "agent_response"
	ToolCall       Type = "tool_call"
	ToolResult     Type = "tool_result"
	PlanCreated    Type = "plan_created"
	PlanStepStart  Type = "plan_step_start"
	PlanStepDone   Type = "plan_step_done"
	SessionStart   Type = "session_start"
	SessionEnd     Type = "session_end"
	ErrorOccurred  Type = "error"
)

type Event struct {
	Type    Type
	Payload map[string]any
}

type Handler func(Event)

type Bus struct {
	mu       sync.RWMutex
	handlers map[Type][]Handler
}

func NewBus() *Bus {
	return &Bus{handlers: make(map[Type][]Handler)}
}

func (b *Bus) On(t Type, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[t] = append(b.handlers[t], h)
}

func (b *Bus) Emit(e Event) {
	b.mu.RLock()
	handlers := b.handlers[e.Type]
	b.mu.RUnlock()

	for _, h := range handlers {
		h(e)
	}
}

func (b *Bus) EmitSimple(t Type, key, value string) {
	b.Emit(Event{Type: t, Payload: map[string]any{key: value}})
}
