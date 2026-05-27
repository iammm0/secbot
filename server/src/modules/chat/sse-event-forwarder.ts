import { EventType, BusEvent } from '../../common/event-bus';
import { TodoItem, InteractionSummary } from '../../common/types';

export type SSEEmit = (name: string, data: Record<string, unknown>) => void;

/** 与 SecurityReActAgent 中 THINK/EXEC 事件的 step 关联键一致 */
export function sseStepKey(data: Record<string, unknown>, iteration: number): string {
  const todoId = data['todoId'];
  if (todoId !== undefined && todoId !== null && String(todoId).length > 0) {
    return `todo-${todoId}`;
  }
  return `iter-${iteration}`;
}

/** CLI 流式输出用：结构化精炼报告 + 较短最终回复 */
export function buildStreamSummaryPayload(summary: InteractionSummary): {
  report: string;
  response: string;
} {
  const findings = summary.keyFindings
    .slice(0, 6)
    .map((l) => `- ${l}`)
    .join('\n');
  const recs = summary.recommendations
    .slice(0, 6)
    .map((l) => `- ${l}`)
    .join('\n');
  const parts: string[] = [];
  const head = summary.taskSummary?.trim();
  if (head) parts.push(`## 摘要\n${head}`);
  if (findings) parts.push(`## 关键发现\n${findings}`);
  if (recs) parts.push(`## 修复建议\n${recs}`);
  const tail = summary.overallConclusion?.trim();
  if (tail) parts.push(`## 总结\n${tail}`);
  let report = parts.join('\n\n');
  if (!report.trim()) {
    report = summary.rawReport?.trim()
      ? summary.rawReport.slice(0, 12_000)
      : '（未能生成摘要，请查看服务端日志。）';
  }
  const response =
    tail ||
    (summary.keyFindings[0]?.trim() ? `首要发现：${summary.keyFindings[0].trim()}` : '') ||
    '详情见上方「安全报告」。';
  return { report, response };
}

/** 推送规划块 */
export function emitPlanningSse(
  emit: SSEEmit,
  planSummary: string,
  todos: TodoItem[],
  scope: 'master' | 'adaptive',
): void {
  if (todos.length === 0) return;
  emit('planning', {
    content: planSummary,
    summary: planSummary,
    scope,
    todos: todos.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
    })),
  });
}

export function forwardAgentEvent(event: BusEvent, emit: SSEEmit): void {
  const t = event.type;
  const d = event.data;
  if (t === EventType.THINK_START) {
    const iteration = Number(d['iteration'] ?? 1);
    emit('thought_start', {
      iteration,
      step_key: sseStepKey(d, iteration),
      task: d['task'] as string | undefined,
    });
  } else if (t === EventType.THINK_END) {
    const iteration = Number(d['iteration'] ?? 1);
    emit('thought', {
      content: d['thought'] ?? '',
      iteration,
      step_key: sseStepKey(d, iteration),
    });
  } else if (t === EventType.EXEC_START) {
    const iteration = Number(d['iteration'] ?? 1);
    emit('action_start', {
      tool: d['tool'] ?? '',
      params: d['params'] ?? {},
      iteration,
      step_key: sseStepKey(d, iteration),
    });
  } else if (t === EventType.EXEC_RESULT) {
    const iteration = Number(d['iteration'] ?? 1);
    emit('action_result', {
      tool: d['tool'] ?? '',
      success: d['success'] ?? true,
      result: d['observation'] ?? '',
      iteration,
      step_key: sseStepKey(d, iteration),
    });
  }
}

export function forwardExploreEvent(event: BusEvent, emit: SSEEmit): void {
  if (event.type === EventType.EXPLORE_START) {
    emit('explore_start', { focus: event.data['focus'] ?? [] });
  } else if (event.type === EventType.EXPLORE_STEP) {
    emit('explore_step', {
      iteration: event.data['iteration'] ?? 0,
      kind: event.data['kind'] ?? '',
      tool: event.data['tool'] ?? '',
      observation: event.data['observation'] ?? '',
      thought: event.data['thought'] ?? '',
    });
  } else if (event.type === EventType.EXPLORE_END) {
    emit('explore_end', {
      facts_count: event.data['factsCount'] ?? 0,
      unresolved: event.data['unresolved'] ?? [],
      summary: event.data['summary'] ?? '',
    });
  }
}

export function emitContextUsage(
  emit: SSEEmit,
  debug: {
    modelName?: string;
    contextWindow: number;
    promptBudget: number;
    usedTokens: number;
    reservedTokens: number;
    focus: string[];
    pinned: number;
  },
): void {
  const ratio =
    debug.promptBudget > 0
      ? Math.min(1, Math.max(0, debug.usedTokens / debug.promptBudget))
      : 0;
  emit('context_usage', {
    model: debug.modelName ?? null,
    context_window: debug.contextWindow,
    prompt_budget: debug.promptBudget,
    used_tokens: debug.usedTokens,
    reserved_tokens: debug.reservedTokens,
    ratio,
    focus: debug.focus,
    pinned: debug.pinned,
  });
}
