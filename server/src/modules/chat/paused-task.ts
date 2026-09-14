import type { PausedTaskSnapshot, PausedTodoSnapshot } from '../../common/types';

export type { PausedTaskSnapshot, PausedTodoSnapshot };

export class TaskPausedError extends Error {
  readonly snapshot: PausedTaskSnapshot;

  constructor(snapshot: Partial<PausedTaskSnapshot> = {}) {
    super('TASK_PAUSED');
    this.name = 'TaskPausedError';
    this.snapshot = {
      originalMessage: snapshot.originalMessage?.trim() || '',
      progressNote: snapshot.progressNote?.trim() || '',
      todos: snapshot.todos ?? [],
    };
  }
}

export function throwIfAborted(signal?: AbortSignal, snapshot?: Partial<PausedTaskSnapshot>): void {
  if (signal?.aborted) {
    throw new TaskPausedError(snapshot);
  }
}

export function isTaskPausedError(error: unknown): error is TaskPausedError {
  return (
    error instanceof TaskPausedError || (error instanceof Error && error.name === 'TaskPausedError')
  );
}

export function snapshotTodos(
  todos: Array<{ id: string; content: string; status: string }>,
): PausedTodoSnapshot[] {
  return todos.map((todo) => ({
    id: todo.id,
    content: todo.content,
    status: String(todo.status),
  }));
}

export function mergePausedSnapshot(
  base: Partial<PausedTaskSnapshot>,
  extra: Partial<PausedTaskSnapshot> = {},
): PausedTaskSnapshot {
  return {
    originalMessage: (extra.originalMessage || base.originalMessage || '').trim(),
    progressNote: (extra.progressNote || base.progressNote || '').trim(),
    todos: extra.todos?.length ? extra.todos : (base.todos ?? []),
  };
}

export function looksLikeContinue(message: string): boolean {
  const text = message.trim();
  if (!text) return true;
  return /^(继续|接着|接着做|继续任务|从中断处|continue|resume)([。.!！\s]|$)/i.test(text);
}

export function buildResumePrompt(paused: PausedTaskSnapshot, userMessage: string): string {
  const followUp = userMessage.trim() || '请从中断处继续完成原任务。';
  const todoLines = paused.todos.map((todo) => `- [${todo.status}] ${todo.content}`).join('\n');
  const parts = [
    `【继续未完成任务】原任务：${paused.originalMessage || followUp}`,
    paused.progressNote ? `中断前进展：${paused.progressNote.slice(0, 4000)}` : '',
    todoLines ? `子任务状态：\n${todoLines}` : '',
    `用户本次补充：${followUp}`,
    '要求：不要把已完成步骤重做；从中断处接着做完原任务。只有当用户明确要求改做全新任务时，才丢弃上述原任务。',
  ];
  return parts.filter(Boolean).join('\n\n');
}
