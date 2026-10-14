import { TodoStatus, type TodoItem } from '../../common/types';

export type PublicTodoStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'paused';

export interface PublicTodo {
  id: string;
  content: string;
  status: PublicTodoStatus;
}

export function classifyTodoFailure(error: string): 'timed_out' | 'cancelled' | 'failed' {
  const text = error.toLowerCase();
  if (/timeout|timed[_ ]?out|etimedout|超时/.test(text)) return 'timed_out';
  if (/\babort\b|\bcancel|暂停|paused/.test(text)) return 'cancelled';
  return 'failed';
}

function statusFromEnum(status: TodoStatus | string): PublicTodoStatus {
  if (status === TodoStatus.COMPLETED || status === 'completed' || status === 'done')
    return 'completed';
  if (status === TodoStatus.IN_PROGRESS || status === 'in_progress') return 'in_progress';
  if (status === TodoStatus.CANCELLED || status === 'cancelled') return 'cancelled';
  if (status === 'failed' || status === 'timed_out' || status === 'paused') return status;
  return 'pending';
}

export function toPublicTodos(
  todos: Array<Pick<TodoItem, 'id' | 'content' | 'status'>>,
  outcomes: ReadonlyMap<string, PublicTodoStatus> = new Map(),
): PublicTodo[] {
  return todos.map((todo) => ({
    id: todo.id,
    content: todo.content,
    status: outcomes.get(todo.id) ?? statusFromEnum(todo.status),
  }));
}

/** 整段任务顺利结束时，把还没标失败/超时/取消的项收成完成。 */
export function finalizePublicTodos(todos: PublicTodo[], clean: boolean): PublicTodo[] {
  if (!clean) return todos;
  return todos.map((todo) =>
    todo.status === 'failed' || todo.status === 'timed_out' || todo.status === 'cancelled'
      ? todo
      : { ...todo, status: 'completed' },
  );
}
