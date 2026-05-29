export interface SSEEvent {
  event: string
  data: Record<string, unknown>
}

export type ChatMode = 'agent'

export interface ChatRequest {
  message: string
  session_id?: string
  mode?: ChatMode
  agent?: string
  model?: string | null
  client_shell?: {
    platform?: string
    shell?: string
    comspec?: string
    terminal_profile?: string
  }
}

export type TimelineItemType =
  | 'thought'
  | 'action'
  | 'observation'
  | 'final'
  | 'planning'
  | 'browser_event'

export interface BrowserStep {
  index: number
  kind: 'start' | 'thought' | 'action_start' | 'action_result' | 'action_error' | 'sensitive_denied' | 'end'
  tool?: string
  target?: string
  detail?: string
  ok?: boolean
  ts: number
}

export interface StreamTimelineItem {
  id: string
  type: TimelineItemType
  title: string
  body: string
  todos?: Array<{ content: string; status?: string }>
  planScope?: 'master' | 'adaptive'
  iteration?: number
  tool?: string
  success?: boolean
  error?: string
  result?: unknown
  status?: 'running' | 'done'
  params?: Record<string, unknown>
  viewType?: 'raw' | 'summary'
  browserSteps?: BrowserStep[]
  focus?: string[]
  exploreSummary?: { factsCount?: number; unresolved?: string[]; summary?: string }
}

export interface ContextUsageSnapshot {
  model: string | null
  contextWindow: number
  promptBudget: number
  usedTokens: number
  reservedTokens: number
  ratio: number
  focus: string[]
  pinned: number
  updatedAt: number
}

export interface StreamState {
  phase: string
  detail: string
  planning: { content: string; todos: Array<{ content: string; status?: string }> } | null
  thought: { iteration: number; content: string } | null
  thoughtChunks: Map<string, string>
  actions: Array<{ tool: string; params: Record<string, unknown>; result?: unknown; error?: string; success?: boolean; viewType?: 'raw' | 'summary' }>
  content: string
  report: string
  error: string | null
  response: string | null
  timeline: StreamTimelineItem[]
  contextUsage: ContextUsageSnapshot | null
  currentUserMessage?: string
}

export interface HistoryItem {
  userMessage: string
  sentAt: number
  streamState: StreamState
  completedAt: number | null
}
