import { describe, expect, it } from 'vitest';
import { TodoStatus, createTodoItem } from '../../common/types';
import { classifyTodoFailure, finalizePublicTodos, toPublicTodos } from './plan-todo-status';

describe('classifyTodoFailure', () => {
  it('recognizes timeouts', () => {
    expect(classifyTodoFailure('Command timed out after 120s')).toBe('timed_out');
    expect(classifyTodoFailure('扫描超时')).toBe('timed_out');
  });

  it('recognizes cancellation separately from a plain failure', () => {
    expect(classifyTodoFailure('任务已暂停')).toBe('cancelled');
    expect(classifyTodoFailure('缺少必要参数: host')).toBe('failed');
  });
});

describe('finalizePublicTodos', () => {
  const todos = toPublicTodos(
    [
      createTodoItem({ id: 'a', content: '扫端口', status: TodoStatus.COMPLETED }),
      createTodoItem({ id: 'b', content: '扫漏洞', status: TodoStatus.PENDING }),
    ],
    new Map([['b', 'failed']]),
  );

  it('keeps failed items when the run is cleanly finished', () => {
    const settled = finalizePublicTodos(todos, true);
    expect(settled.map((todo) => todo.status)).toEqual(['completed', 'failed']);
  });

  it('does not rewrite a partial run', () => {
    expect(finalizePublicTodos(todos, false).map((todo) => todo.status)).toEqual(['completed', 'failed']);
  });
});
