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

export function markTodoCompleted(
  todo: TodoItem,
  resultSummary = '',
): TodoItem {
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

export function createSession(
  partial: Partial<Session> & { id: string },
): Session {
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
    messages: [
      ...session.messages,
      { role, content, timestamp: new Date(), metadata },
    ],
    updatedAt: new Date(),
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
