package event

import (
	"sync"
)

type Type string

const (
	// 规划相关
	PlanStart    Type = "plan_start"
	PlanTodo     Type = "plan_todo"
	PlanComplete Type = "plan_complete"

	// 推理相关
	ThinkStart Type = "think_start"
	ThinkChunk Type = "think_chunk"
	ThinkEnd   Type = "think_end"

	// 执行相关
	ExecStart    Type = "exec_start"
	ExecProgress Type = "exec_progress"
	ExecResult   Type = "exec_result"

	// 内容
	Content Type = "content"

	// 报告相关
	ReportStart Type = "report_start"
	ReportChunk Type = "report_chunk"
	ReportEnd   Type = "report_end"

	// 任务阶段
	TaskPhase Type = "task_phase"

	// 编排上下文
	IntentDecision Type = "intent_decision"
	ExploreStart   Type = "explore_start"
	ExploreStep    Type = "explore_step"
	ExploreEnd     Type = "explore_end"
	ContextUsage   Type = "context_usage"
	ContextPatch   Type = "context_patch"
	Clarify        Type = "clarify"

	// 交互控制
	ConfirmRequired Type = "confirm_required"
	RootRequired    Type = "root_required"
	SessionUpdate   Type = "session_update"
	ErrorOccurred   Type = "error"

	// 兼容旧事件名
	AgentThinking Type = "agent_thinking"
	AgentResponse Type = "agent_response"
	ToolCall      Type = "tool_call"
	ToolResult    Type = "tool_result"
	PlanCreated   Type = "plan_created"
	PlanStepStart Type = "plan_step_start"
	PlanStepDone  Type = "plan_step_done"
	SessionStart  Type = "session_start"
	SessionEnd    Type = "session_end"
)

type Event struct {
	Type      Type
	Payload   map[string]any
	Iteration int
}

type Handler func(Event)

type handlerEntry struct {
	id      uint64
	handler Handler
}

type Bus struct {
	mu             sync.RWMutex
	nextID         uint64
	handlers       map[Type][]handlerEntry
	globalHandlers []handlerEntry
}

func NewBus() *Bus {
	return &Bus{handlers: make(map[Type][]handlerEntry)}
}

func (b *Bus) On(t Type, h Handler) {
	_ = b.Subscribe(t, h)
}

func (b *Bus) Subscribe(t Type, h Handler) func() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.nextID++
	id := b.nextID
	b.handlers[t] = append(b.handlers[t], handlerEntry{id: id, handler: h})
	return func() { b.unsubscribe(t, id, false) }
}

func (b *Bus) OnAll(h Handler) {
	_ = b.SubscribeAll(h)
}

func (b *Bus) SubscribeAll(h Handler) func() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.nextID++
	id := b.nextID
	b.globalHandlers = append(b.globalHandlers, handlerEntry{id: id, handler: h})
	return func() { b.unsubscribe("", id, true) }
}

func (b *Bus) Emit(e Event) {
	b.mu.RLock()
	globals := append([]handlerEntry(nil), b.globalHandlers...)
	typed := append([]handlerEntry(nil), b.handlers[e.Type]...)
	b.mu.RUnlock()

	for _, entry := range globals {
		entry.handler(e)
	}
	for _, entry := range typed {
		entry.handler(e)
	}
}

func (b *Bus) EmitSimple(t Type, key, value string) {
	b.Emit(Event{Type: t, Payload: map[string]any{key: value}})
}

func (b *Bus) EmitData(t Type, data map[string]any) {
	b.Emit(Event{Type: t, Payload: data})
}

func (b *Bus) EmitWithIteration(t Type, iteration int, data map[string]any) {
	b.Emit(Event{Type: t, Payload: data, Iteration: iteration})
}

func (b *Bus) unsubscribe(t Type, id uint64, global bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if global {
		b.globalHandlers = removeHandlerEntry(b.globalHandlers, id)
		return
	}
	b.handlers[t] = removeHandlerEntry(b.handlers[t], id)
}

func removeHandlerEntry(items []handlerEntry, id uint64) []handlerEntry {
	for i, item := range items {
		if item.id == id {
			return append(items[:i], items[i+1:]...)
		}
	}
	return items
}
