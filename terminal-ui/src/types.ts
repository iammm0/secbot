/**
 * SSE 事件与 Chat 请求类型（与 router/schemas.py、router/routers/chat.py 对齐）
 */
export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export type ChatMode = "ask" | "agent";

export interface ChatRequest {
  message: string;
  mode?: ChatMode;
  agent?: string;
  prompt?: string | null;
  model?: string | null;
  /** 可选：随 TUI 上报，与后端 ChatRequestDto.client_shell 对齐 */
  client_shell?: {
    platform?: string;
    shell?: string;
    comspec?: string;
    terminal_profile?: string;
  };
}

export type TimelineItemType =
  | "thought"
  | "action"
  | "observation"
  | "final"
  | "planning";

/** 按事件发生顺序记录的时间线项，用于 TUI 顺序渲染 */
export interface StreamTimelineItem {
  id: string;
  type: TimelineItemType;
  title: string;
  body: string;
  /** 规划块：待办列表（与 planning SSE 一致） */
  todos?: Array<{ content: string; status?: string }>;
  /** master=首轮总规划；adaptive=执行过程中穿插的补充规划 */
  planScope?: "master" | "adaptive";
  iteration?: number;
  tool?: string;
  success?: boolean;
  error?: string;
  result?: unknown;
  status?: "running" | "done";
  /** 工具调用块：与 action_start 同源，便于结束时仍显示 execute_command 等参数 */
  params?: Record<string, unknown>;
}

/** 流式状态：用于 UI 展示 */
export interface StreamState {
  phase: string;
  detail: string;
  planning: {
    content: string;
    todos: Array<{ content: string; status?: string }>;
  } | null;
  thought: { iteration: number; content: string } | null;
  /** 推理流分片正文，键为后端 step_key（或 iter-N），避免并行子任务 iteration 重复时覆盖 */
  thoughtChunks: Map<string, string>;
  actions: Array<{
    tool: string;
    params: Record<string, unknown>;
    result?: unknown;
    error?: string;
    success?: boolean;
    viewType?: "raw" | "summary";
  }>;
  content: string;
  report: string;
  error: string | null;
  response: string | null;
  timeline: StreamTimelineItem[];
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

/** 可渲染的块类型（扩展多种展示形态） */
export type BlockRenderType =
  | "api"
  | "phase"
  | "error"
  | "planning"
  | "thought"
  | "actions"
  | "content"
  | "report"
  | "response"
  | "user_message"
  | "warning"
  | "summary"
  | "code"
  | "json"
  | "table"
  | "bullet"
  | "numbered"
  | "quote"
  | "heading"
  | "divider"
  | "link"
  | "key_value"
  | "diff"
  | "terminal"
  | "exploring"
  | "spacer"
  | "security"
  | "tool_result"
  | "exception"
  | "suggestion"
  | "success"
  | "info";

/**
 * 内容块：用于分块 + Markdown 渲染
 *
 * 元数据字段说明（可选，仅特定块类型使用）：
 *  - sentAt      : user_message 块 — 用户发送该消息的时刻（Date.now()）
 *  - completedAt : response 块    — Secbot 响应完成的时刻（Date.now()），0 表示尚未完成
 *  - durationMs  : response 块    — 从发送到完成的耗时（毫秒），completedAt - sentAt
 */
export interface ContentBlock {
  id: string;
  type: BlockRenderType;
  title?: string;
  /** Markdown 正文，由 MD 渲染组件渲染 */
  body: string;
  /** 规划块专用：待办列表，有则用 TodoList 渲染 */
  todos?: TodoItemData[];
  /** 执行块专用：工具列表，有则用 ActionItem 渲染 */
  actions?: ActionItemData[];
  /** 块起始行（用于滚动计算） */
  lineStart: number;
  /** 块结束行（不含） */
  lineEnd: number;
  /** 经判别模块解析后的渲染类型（可选，无则运行时判别） */
  resolvedType?: ContentBlock["type"];

  // ── 时间戳元数据 ──────────────────────────────────────────────────────────────
  /** user_message 块：用户发送该消息的时刻（Date.now()），未设置则不展示时间戳 */
  sentAt?: number;
  /** response 块：Secbot 响应完成的时刻（Date.now()），0 或未设置表示尚未完成 */
  completedAt?: number;
  /** response 块：从 sentAt 到 completedAt 的耗时（毫秒），由上层计算后注入 */
  durationMs?: number;
}
