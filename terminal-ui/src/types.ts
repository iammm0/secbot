/**
 * SSE 事件与 Chat 请求类型（与 router/schemas.py、router/routers/chat.py 对齐）
 */
export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export type ChatMode = 'ask' | 'plan' | 'agent';

export interface ChatRequest {
  message: string;
  mode?: ChatMode;
  agent?: string;
  prompt?: string | null;
  model?: string | null;
}

/** 流式状态：用于 UI 展示 */
export interface StreamState {
  phase: string;
  detail: string;
  planning: { content: string; todos: Array<{ content: string; status?: string }> } | null;
  thought: { iteration: number; content: string } | null;
  thoughtChunks: Map<number, string>;
  actions: Array<{ tool: string; params: Record<string, unknown>; result?: unknown; error?: string; success?: boolean }>;
  content: string;
  report: string;
  error: string | null;
  response: string | null;
}
