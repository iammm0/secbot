package session

import (
	"context"
	"fmt"

	"secbot/internal/patterns"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

// Executor 封装计划执行逻辑
type Executor struct {
	llm   llms.Model
	tools []tools.Tool
	bus   *event.Bus
}

func NewExecutor(llm llms.Model, toolList []tools.Tool, bus *event.Bus) *Executor {
	return &Executor{llm: llm, tools: toolList, bus: bus}
}

func (e *Executor) ExecutePlan(ctx context.Context, goal string) (*patterns.PlanResult, error) {
	logger.Infof("[Executor] 开始执行计划: %s", goal)

	e.bus.EmitSimple(event.PlanCreated, "goal", goal)

	planner := patterns.NewPlanner(e.llm, e.tools, 8)
	plan, err := planner.CreatePlan(ctx, goal)
	if err != nil {
		return nil, fmt.Errorf("创建计划失败: %w", err)
	}

	for i, step := range plan.Steps {
		e.bus.Emit(event.Event{
			Type: event.PlanStepStart,
			Payload: map[string]any{
				"step_id":     step.ID,
				"step_num":    i + 1,
				"description": step.Description,
			},
		})
	}

	result, err := planner.ExecutePlan(ctx, plan)
	if err != nil {
		return nil, fmt.Errorf("执行计划失败: %w", err)
	}

	for _, sr := range result.StepResults {
		e.bus.Emit(event.Event{
			Type: event.PlanStepDone,
			Payload: map[string]any{
				"step_id": sr.StepID,
				"success": sr.Success,
			},
		})
	}

	return result, nil
}
