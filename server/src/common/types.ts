export enum TodoStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum RequestType {
  GREETING = 'greeting',
  SIMPLE = 'simple',
  TECHNICAL = 'technical',
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export type RouteType = 'qa' | 'technical' | 'other';

/**
 * IntentRouter 输出的 6 类意图：
 * - small_talk：闲聊/感谢/表情/确认；不进入编排，直接回
 * - meta：询问 secbot 自身、改设置、看历史；不进入编排
 * - qa：安全知识/概念问答，无需工具
 * - clarify_needed：任务意图但关键参数缺失，需要先追问
 * - task_simple：任务但显然单步可解，跳过 Planner，直接由 ReAct 单轮处理
 * - task_complex：任务，需要 Plan + Execute + (optional) Summary
 */
export type Intent =
  | 'small_talk'
  | 'meta'
  | 'qa'
  | 'clarify_needed'
  | 'task_simple'
  | 'task_complex';

export interface IntentDecision {
  intent: Intent;
  confidence: number;
  /** 是否需要先跑 ExploreAgent 补上下文 */
  needsExplore: boolean;
  /** 是否需要 SummaryAgent 出报告 */
  needsReport: boolean;
  /** 从用户输入抽出的关注点/实体（target / cve / 协议 / 主机 等） */
  focus: string[];
  /** small_talk / meta / qa 时可直接返回的简短回复 */
  directResponse?: string | null;
  /** clarify_needed 时模型建议的追问 */
  clarifyQuestion?: string | null;
  /** 调试或日志字段（路由理由） */
  rationale?: string;
}

/** TTL 决定 ContextItem 何时清理；持久型只能由用户/系统手动移除 */
export type ContextTtl = 'turn' | 'session' | 'persistent';

export type ContextItemSource = 'recent' | 'sqlite' | 'vector' | 'explore' | 'user_pinned';

export interface ContextItem {
  id: string;
  content: string;
  source: ContextItemSource;
  /** 0-1 的相对优先级，越大越应该留在上下文里 */
  priority: number;
  /** 估算 token 数（approxTokens 估算结果） */
  tokensEstimate: number;
  tags: string[];
  ttl: ContextTtl;
  createdAt: Date;
}

export interface FocusEntry {
  keyword: string;
  /** 权重，每轮可衰减 */
  weight: number;
  lastSeenAt: Date;
}

export interface SessionContextState {
  pinned: ContextItem[];
  focus: FocusEntry[];
  unresolved: string[];
  /** 当前会话所选模型名（影响预算） */
  modelName?: string;
}

export interface ContextPatchFact {
  key: string;
  value: string;
  priority?: number;
  ttl?: ContextTtl;
  tags?: string[];
}

/**
 * ExploreAgent 产出的「上下文补丁」。
 * 由 ContextManager.applyPatch 写入对应 session 的 ContextStore。
 */
export interface ContextPatch {
  facts: ContextPatchFact[];
  pinned?: string[];
  unresolved?: string[];
  suggestedFocus?: string[];
  /** ExploreAgent 自检的简短总结，用于 SSE/日志，不进入 prompt */
  exploreSummary?: string;
}

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  dependsOn: string[];
  toolHint: string;
  resultSummary: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createTodoItem(
  partial: Partial<TodoItem> & { id: string; content: string },
): TodoItem {
  const now = new Date();
  return {
    status: TodoStatus.PENDING,
    dependsOn: [],
    toolHint: '',
    resultSummary: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function markTodoInProgress(todo: TodoItem): TodoItem {
  return { ...todo, status: TodoStatus.IN_PROGRESS, updatedAt: new Date() };
}

export function markTodoCompleted(todo: TodoItem, resultSummary = ''): TodoItem {
  return {
    ...todo,
    status: TodoStatus.COMPLETED,
    resultSummary: resultSummary || todo.resultSummary,
    updatedAt: new Date(),
  };
}

export function markTodoCancelled(todo: TodoItem): TodoItem {
  return { ...todo, status: TodoStatus.CANCELLED, updatedAt: new Date() };
}

export interface PlanResult {
  requestType: RequestType;
  todos: TodoItem[];
  directResponse: string | null;
  planSummary: string;
}

export interface InteractionSummary {
  taskSummary: string;
  todoCompletion: Record<string, unknown>;
  keyFindings: string[];
  actionSummary: string[];
  riskAssessment: string;
  recommendations: string[];
  overallConclusion: string;
  rawReport: string;
}

export interface SessionMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface Session {
  id: string;
  name: string;
  messages: SessionMessage[];
  agentType: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createSession(partial: Partial<Session> & { id: string }): Session {
  const now = new Date();
  return {
    name: '',
    messages: [],
    agentType: 'hackbot',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function addSessionMessage(
  session: Session,
  role: MessageRole,
  content: string,
  metadata: Record<string, unknown> = {},
): Session {
  return {
    ...session,
    messages: [...session.messages, { role, content, timestamp: new Date(), metadata }],
    updatedAt: new Date(),
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
