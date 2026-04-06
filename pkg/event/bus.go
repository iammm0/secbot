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

type Bus struct {
	mu             sync.RWMutex
	handlers       map[Type][]Handler
	globalHandlers []Handler
}

func NewBus() *Bus {
	return &Bus{handlers: make(map[Type][]Handler)}
}

func (b *Bus) On(t Type, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[t] = append(b.handlers[t], h)
}

func (b *Bus) OnAll(h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.globalHandlers = append(b.globalHandlers, h)
}

func (b *Bus) Emit(e Event) {
	b.mu.RLock()
	globals := b.globalHandlers
	typed := b.handlers[e.Type]
	b.mu.RUnlock()

	for _, h := range globals {
		h(e)
	}
	for _, h := range typed {
		h(e)
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
