package session

import (
	"context"
	"fmt"
	"sync"

	"secbot/internal/agent"
	"secbot/internal/models"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"golang.org/x/sync/errgroup"
)

type TaskExecutor struct {
	coordinator *agent.CoordinatorAgent
	planner     *agent.PlannerAgent
	bus         *event.Bus
}

func NewTaskExecutor(coordinator *agent.CoordinatorAgent, planner *agent.PlannerAgent, bus *event.Bus) *TaskExecutor {
	return &TaskExecutor{
		coordinator: coordinator,
		planner:     planner,
		bus:         bus,
	}
}

func (e *TaskExecutor) Run(ctx context.Context, userInput string, planResult *models.PlanResult, onEvent models.EventCallback) (string, error) {
	layers := e.planner.GetExecutionOrder()
	if len(layers) == 0 {
		return "", fmt.Errorf("无可执行步骤")
	}

	logger.Infof("[TaskExecutor] 开始分层执行, %d 层", len(layers))

	todoMap := make(map[string]*models.TodoItem)
	for i := range planResult.Todos {
		todoMap[planResult.Todos[i].ID] = &planResult.Todos[i]
	}

	execContext := make(map[string]any)
	var allResults []string

	for layerIdx, layer := range layers {
		logger.Infof("[TaskExecutor] 执行第 %d 层, %d 个任务", layerIdx+1, len(layer))

		if len(layer) == 1 {
			todoID := layer[0]
			todo, ok := todoMap[todoID]
			if !ok {
				continue
			}

			result, err := e.executeSingleTodo(ctx, *todo, execContext, onEvent)
			if err != nil {
				logger.Warnf("[TaskExecutor] todo %s 失败: %v", todoID, err)
			} else {
				execContext[todoID] = result
				allResults = append(allResults, result)
			}
		} else {
			results := e.executeLayerParallel(ctx, layer, todoMap, execContext, onEvent)
			for todoID, result := range results {
				execContext[todoID] = result
				allResults = append(allResults, result)
			}
		}
	}

	var response string
	for _, r := range allResults {
		response += r + "\n\n"
	}
	return response, nil
}

func (e *TaskExecutor) executeSingleTodo(ctx context.Context, todo models.TodoItem, execCtx map[string]any, onEvent models.EventCallback) (string, error) {
	if onEvent != nil {
		onEvent("action_start", map[string]any{
			"tool": todo.ToolHint, "todo_id": todo.ID,
			"agent": e.coordinator.AgentType(),
		})
	}

	e.planner.UpdateTodo(todo.ID, models.TodoInProgress, "")
	e.bus.EmitData(event.PlanTodo, map[string]any{
		"todo_id": todo.ID, "status": "in_progress",
	})

	opts := &models.ProcessOptions{OnEvent: onEvent}
	result, err := e.coordinator.ExecuteTodo(ctx, todo, execCtx, opts)

	if err != nil {
		e.planner.UpdateTodo(todo.ID, models.TodoFailed, err.Error())
		e.bus.EmitData(event.PlanTodo, map[string]any{
			"todo_id": todo.ID, "status": "failed", "result_summary": err.Error(),
		})
		if onEvent != nil {
			onEvent("action_result", map[string]any{
				"tool": todo.ToolHint, "success": false, "error": err.Error(),
			})
		}
		return "", err
	}

	e.planner.UpdateTodo(todo.ID, models.TodoCompleted, "成功")
	e.bus.EmitData(event.PlanTodo, map[string]any{
		"todo_id": todo.ID, "status": "completed", "result_summary": "成功",
	})
	if onEvent != nil {
		display := result
		if len(display) > 500 {
			display = display[:500] + "..."
		}
		onEvent("action_result", map[string]any{
			"tool": todo.ToolHint, "success": true, "result": display,
		})
	}

	return result, nil
}

func (e *TaskExecutor) executeLayerParallel(
	ctx context.Context,
	layer []string,
	todoMap map[string]*models.TodoItem,
	execCtx map[string]any,
	onEvent models.EventCallback,
) map[string]string {
	type todoResult struct {
		ID     string
		Result string
		Err    error
	}

	var mu sync.Mutex
	results := make(map[string]string)
	var bufferedEvents []struct {
		id     string
		events []struct {
			typ  string
			data map[string]any
		}
	}

	g, gCtx := errgroup.WithContext(ctx)

	for _, todoID := range layer {
		todo, ok := todoMap[todoID]
		if !ok {
			continue
		}

		todoID := todoID
		todoCopy := *todo

		g.Go(func() error {
			var localEvents []struct {
				typ  string
				data map[string]any
			}

			localOnEvent := func(typ string, data map[string]any) {
				mu.Lock()
				localEvents = append(localEvents, struct {
					typ  string
					data map[string]any
				}{typ, data})
				mu.Unlock()
			}

			opts := &models.ProcessOptions{OnEvent: localOnEvent}
			result, err := e.coordinator.ExecuteTodo(gCtx, todoCopy, execCtx, opts)

			mu.Lock()
			if err != nil {
				e.planner.UpdateTodo(todoID, models.TodoFailed, err.Error())
			} else {
				results[todoID] = result
				e.planner.UpdateTodo(todoID, models.TodoCompleted, "成功")
			}
			bufferedEvents = append(bufferedEvents, struct {
				id     string
				events []struct {
					typ  string
					data map[string]any
				}
			}{todoID, localEvents})
			mu.Unlock()

			return nil
		})
	}

	_ = g.Wait()

	if onEvent != nil {
		for _, be := range bufferedEvents {
			for _, ev := range be.events {
				onEvent(ev.typ, ev.data)
			}
		}
	}

	return results
}
