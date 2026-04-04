import { SecurityReActAgent } from './security-react-agent';
import { PlannerAgent } from './planner-agent';
import { EventBus, EventType, BusEvent } from '../../../common/event-bus';
import {
  PlanResult,
  TodoItem,
  TodoStatus,
  markTodoInProgress,
  markTodoCompleted,
  markTodoCancelled,
} from '../../../common/types';

type OnEventCallback = (event: BusEvent) => void;

export class TaskExecutor {
  private readonly plan: PlanResult;
  private readonly agent: SecurityReActAgent;
  private readonly eventBus: EventBus;
  private readonly planner: PlannerAgent;

  constructor(plan: PlanResult, agent: SecurityReActAgent, eventBus: EventBus) {
    this.plan = plan;
    this.agent = agent;
    this.eventBus = eventBus;
    this.planner = new PlannerAgent();
  }

  async run(userInput: string, onEvent?: OnEventCallback): Promise<string> {
    const layers = this.planner.getExecutionOrder(this.plan.todos);
    const results: string[] = [];
    let currentTodos = [...this.plan.todos];

    this.eventBus.emitSimple(EventType.PLAN_START, {
      totalTodos: currentTodos.length,
      totalLayers: layers.length,
      userInput,
    });

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];

      this.eventBus.emitSimple(EventType.TASK_PHASE, {
        phase: 'layer_start',
        layerIndex: layerIdx,
        todoIds: layer.map((t) => t.id),
      });

      onEvent?.({
        type: EventType.TASK_PHASE,
        data: {
          phase: 'layer_start',
          layerIndex: layerIdx,
          todoCount: layer.length,
        },
        timestamp: new Date(),
        iteration: layerIdx,
      });

      currentTodos = currentTodos.map((t) => {
        const inLayer = layer.find((lt) => lt.id === t.id);
        return inLayer ? markTodoInProgress(t) : t;
      });

      const layerPromises = layer.map(async (todo) => {
        this.eventBus.emitSimple(EventType.EXEC_START, {
          todoId: todo.id,
          task: todo.content,
          layerIndex: layerIdx,
        });

        try {
          const result = await this.agent.executeTodo(todo, userInput, {
            onEvent,
          });

          const resultText =
            typeof result.result === 'string' ? result.result : JSON.stringify(result.result ?? '');

          currentTodos = currentTodos.map((t) =>
            t.id === todo.id ? markTodoCompleted(t, resultText) : t,
          );

          this.eventBus.emitSimple(EventType.EXEC_RESULT, {
            todoId: todo.id,
            success: result.success,
            result: resultText,
          });

          return `[${todo.id}] ${todo.content}\n结果: ${resultText}`;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          currentTodos = currentTodos.map((t) => (t.id === todo.id ? markTodoCancelled(t) : t));

          this.eventBus.emitSimple(EventType.ERROR, {
            todoId: todo.id,
            error: errorMsg,
          });

          return `[${todo.id}] ${todo.content}\n错误: ${errorMsg}`;
        }
      });

      const layerResults = await Promise.all(layerPromises);
      results.push(...layerResults);

      this.eventBus.emitSimple(EventType.TASK_PHASE, {
        phase: 'layer_complete',
        layerIndex: layerIdx,
      });
    }

    const completedCount = currentTodos.filter((t) => t.status === TodoStatus.COMPLETED).length;
    const totalCount = currentTodos.length;

    const summary =
      `执行完成：${completedCount}/${totalCount} 个任务成功\n\n` + results.join('\n\n---\n\n');

    this.eventBus.emitSimple(EventType.PLAN_COMPLETE, {
      completed: completedCount,
      total: totalCount,
    });

    onEvent?.({
      type: EventType.PLAN_COMPLETE,
      data: { completed: completedCount, total: totalCount, summary },
      timestamp: new Date(),
      iteration: 0,
    });

    return summary;
  }
}
