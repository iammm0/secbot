export interface PlanTodo {
  id?: string;
  content: string;
  status?: string;
}

const KNOWN = new Set([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
  "paused",
]);

export function normalizePlanStatus(status?: string): string {
  const value = String(status ?? "pending").trim().toLowerCase();
  if (value === "done" || value === "complete" || value === "success" || value === "完成") {
    return "completed";
  }
  if (value === "running" || value === "active" || value === "进行中") return "in_progress";
  if (value === "timeout" || value === "timedout" || value === "超时") return "timed_out";
  if (value === "error" || value === "failure" || value === "失败") return "failed";
  if (value === "canceled" || value === "取消") return "cancelled";
  if (value === "暂停") return "paused";
  return KNOWN.has(value) ? value : "pending";
}

export function normalizePlanTodos(raw: unknown): PlanTodo[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const rec = item as Record<string, unknown>;
    const content = String(rec.content ?? "").trim();
    if (!content) return [];
    const id = typeof rec.id === "string" && rec.id ? rec.id : undefined;
    return [
      {
        id,
        content,
        status: normalizePlanStatus(typeof rec.status === "string" ? rec.status : undefined),
      },
    ];
  });
}

export function mergePlanTodos(current: PlanTodo[] | undefined, incoming: PlanTodo[]): PlanTodo[] {
  if (!incoming.length) return current ?? [];
  if (!current?.length) return incoming;
  const byId = new Map(incoming.filter((todo) => todo.id).map((todo) => [todo.id as string, todo]));
  if (byId.size > 0 && current.some((todo) => todo.id && byId.has(todo.id))) {
    return current.map((todo) => {
      const next = todo.id ? byId.get(todo.id) : undefined;
      return next ? { ...todo, content: next.content || todo.content, status: next.status } : todo;
    });
  }
  if (incoming.length === current.length) {
    return current.map((todo, index) => ({
      ...todo,
      id: todo.id || incoming[index]?.id,
      status: incoming[index]?.status ?? todo.status,
    }));
  }
  return incoming;
}

function listsOverlap(current: PlanTodo[] | undefined, incoming: PlanTodo[]): boolean {
  if (!current?.length) return false;
  if (incoming.some((todo) => todo.id && current.some((item) => item.id === todo.id))) return true;
  return incoming.some((todo) => current.some((item) => item.content === todo.content));
}

export function settlePlanTodos(
  todos: PlanTodo[] | undefined,
  ending: "success" | "failed" | "timed_out" | "paused",
): PlanTodo[] {
  return (todos ?? []).map((todo) => {
    const status = normalizePlanStatus(todo.status);
    if (status === "completed" || status === "failed" || status === "timed_out" || status === "cancelled") {
      return { ...todo, status };
    }
    if (ending === "success") return { ...todo, status: "completed" };
    if (status === "in_progress") return { ...todo, status: ending };
    return { ...todo, status: "pending" };
  });
}

export function failureEnding(message: string): "timed_out" | "failed" {
  return /timeout|timed[_ ]?out|etimedout|超时/i.test(message) ? "timed_out" : "failed";
}

interface PlanCarrier {
  planning: { content: string; todos: PlanTodo[] } | null;
  timeline: Array<{ type: string; todos?: PlanTodo[] }>;
}

export function withPlanTodos<T extends PlanCarrier>(state: T, incoming: PlanTodo[]): T {
  if (!incoming.length) return state;
  const indexes = state.timeline.flatMap((item, index) => (item.type === "planning" ? [index] : []));
  const timeline = state.timeline.map((item) => ({ ...item }));
  let patched = false;
  for (const index of indexes) {
    const item = timeline[index];
    const matched = listsOverlap(item.todos, incoming);
    const isLast = index === indexes[indexes.length - 1];
    if (!matched && !isLast) continue;
    if (!matched && indexes.some((other) => listsOverlap(timeline[other].todos, incoming))) continue;
    timeline[index] = { ...item, todos: mergePlanTodos(item.todos, incoming) };
    patched = true;
  }
  if (!patched && indexes.length > 0) {
    const index = indexes[indexes.length - 1];
    timeline[index] = { ...timeline[index], todos: mergePlanTodos(timeline[index].todos, incoming) };
  }
  const planning = state.planning
    ? { ...state.planning, todos: mergePlanTodos(state.planning.todos, incoming) }
    : state.planning;
  return { ...state, planning, timeline };
}

export function withSettledPlan<T extends PlanCarrier>(
  state: T,
  ending: "success" | "failed" | "timed_out" | "paused",
): T {
  return {
    ...state,
    planning: state.planning
      ? { ...state.planning, todos: settlePlanTodos(state.planning.todos, ending) }
      : state.planning,
    timeline: state.timeline.map((item) =>
      item.type === "planning" ? { ...item, todos: settlePlanTodos(item.todos, ending) } : item,
    ),
  };
}
