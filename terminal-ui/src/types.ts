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

/** 规划待办项（供 TodoList 渲染） */
export interface TodoItemData {
  content: string;
  status?: string;
}

/** 工具执行项（供 ActionItem 渲染） */
export interface ActionItemData {
  tool: string;
  success?: boolean;
  result?: unknown;
  error?: string;
}

/** 内容块：用于分块 + Markdown 渲染 */
export interface ContentBlock {
  id: string;
  type: 'api' | 'phase' | 'error' | 'planning' | 'thought' | 'actions' | 'content' | 'report' | 'response' | 'warning' | 'summary' | 'code';
  title?: string;
  /** Markdown 正文，由 MD 渲染组件渲染；折叠时为占位文案 */
  body: string;
  /** 折叠时的完整正文，展开后由 body 展示 */
  fullBody?: string;
  /** 规划块专用：待办列表，有则用 TodoList 渲染 */
  todos?: TodoItemData[];
  /** 执行块专用：工具列表，有则用 ActionItem 渲染 */
  actions?: ActionItemData[];
  /** 块起始行（用于滚动计算） */
  lineStart: number;
  /** 块结束行（不含） */
  lineEnd: number;
}
