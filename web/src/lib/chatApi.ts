import { API_BASE_URL } from './constants'
import { unwrapData } from './api'
import type { HistoryItem, StreamState } from './types'

export interface PersistedConversationRecord {
  id?: number
  timestamp: string
  agentType: string
  userMessage: string
  assistantMessage: string
  sessionId: string
  metadata?: string
}

export interface PersistedChatSessionRecord {
  sessionId: string
  title: string
  agentType: string
  turnCount: number
  createdAt: string
  updatedAt: string
}

export interface PersistedChatSessionsResponse {
  sessions: PersistedChatSessionRecord[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface PersistedChatSessionHistoryResponse {
  sessionId: string
  conversations: PersistedConversationRecord[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export const PAUSED_REPLY = '任务已暂停。发送消息即可从中断处继续原任务。'

function emptyStreamState(overrides: Partial<StreamState> = {}): StreamState {
  return {
    phase: '',
    detail: '',
    planning: null,
    thought: null,
    thoughtChunks: new Map(),
    actions: [],
    content: '',
    report: '',
    error: null,
    response: null,
    timeline: [],
    contextUsage: null,
    ...overrides,
  }
}

export async function fetchChatSessions(): Promise<PersistedChatSessionsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions?limit=50&offset=0`)
  if (!response.ok) {
    throw new Error(`加载会话列表失败（HTTP ${response.status}）`)
  }
  return unwrapData<PersistedChatSessionsResponse>(await response.json())
}

export async function fetchSessionHistory(sessionId: string): Promise<PersistedChatSessionHistoryResponse> {
  const encoded = encodeURIComponent(sessionId)
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${encoded}/history?limit=100&offset=0`)
  if (!response.ok) {
    throw new Error(`加载会话历史失败（HTTP ${response.status}）`)
  }
  return unwrapData<PersistedChatSessionHistoryResponse>(await response.json())
}

export async function patchChatMessage(
  sessionId: string,
  body: { role: 'user' | 'assistant'; from: string; to: string; conversationId?: number; blockId?: string },
): Promise<void> {
  const encoded = encodeURIComponent(sessionId)
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${encoded}/messages`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`更新消息失败（HTTP ${response.status}）`)
  }
}

export async function patchChatSession(sessionId: string, title: string): Promise<void> {
  const encoded = encodeURIComponent(sessionId)
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${encoded}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!response.ok) {
    throw new Error(`更新会话失败（HTTP ${response.status}）`)
  }
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const encoded = encodeURIComponent(sessionId)
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${encoded}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`删除会话失败（HTTP ${response.status}）`)
  }
}

export function isTitleOnlyPlaceholder(record: PersistedConversationRecord): boolean {
  if (record.assistantMessage.trim()) return false
  try {
    const meta = JSON.parse(record.metadata || '{}') as {
      title?: string
      paused?: unknown
      timeline?: unknown[]
    }
    return (
      !meta.paused &&
      (!Array.isArray(meta.timeline) || meta.timeline.length === 0) &&
      Boolean(meta.title?.trim()) &&
      record.userMessage.trim() === meta.title?.trim()
    )
  } catch {
    return false
  }
}

export function conversationToHistoryItem(record: PersistedConversationRecord): HistoryItem {
  const timestamp = Date.parse(record.timestamp)
  const completedAt = Number.isFinite(timestamp) ? timestamp : Date.now()
  let meta: { paused?: { originalMessage?: string } | null; timeline?: Array<{ id?: string; type?: string; title?: string; body?: string; tool?: string; planScope?: 'master' | 'adaptive'; todos?: Array<{ id?: string; content: string; status?: string }> }> } = {}
  try {
    meta = JSON.parse(record.metadata || '{}') as typeof meta
  } catch {
    meta = {}
  }
  const paused = Boolean(meta.paused?.originalMessage) || record.assistantMessage.trim() === PAUSED_REPLY
  const id = `persisted-${record.id ?? completedAt}`
  const timelineFromMeta = (meta.timeline ?? []).map((item, index) => ({
    id: item.id || `persisted-step-${record.id ?? completedAt}-${index}`,
    type: (item.type as HistoryItem['streamState']['timeline'][number]['type']) || 'final',
    title: item.title || item.tool || item.type || '',
    body: item.body || '',
    tool: item.tool,
    planScope: item.planScope,
    todos: item.todos,
    status: 'done' as const,
  }))
  const assistantMessage = record.assistantMessage.trim()
  const hasPersistedReply = timelineFromMeta.some(
    (item) => item.type === 'final' && item.body.trim() === assistantMessage,
  )
  const timeline = [
    ...timelineFromMeta,
    ...(assistantMessage && !hasPersistedReply
      ? [{
          id: `persisted-final-${record.id ?? completedAt}`,
          type: 'final' as const,
          title: paused ? '任务已暂停' : '最终总结',
          body: record.assistantMessage,
          status: 'done' as const,
        }]
      : []),
  ]
  return {
    id,
    conversationId: record.id,
    userMessage: record.userMessage,
    sentAt: completedAt,
    completedAt: paused ? null : completedAt,
    paused,
    streamState: emptyStreamState({
      response: record.assistantMessage,
      timeline,
    }),
  }
}

function turnScore(item: HistoryItem): number {
  const timeline = item.streamState.timeline?.length ?? 0
  const response = item.streamState.response?.length ?? 0
  return timeline * 1000 + response
}

function pickRicher(a: HistoryItem, b: HistoryItem): HistoryItem {
  return turnScore(a) >= turnScore(b) ? a : b
}

/** Collapse near-duplicate turns (same user text within a few seconds). */
export function dedupeTurns(items: HistoryItem[]): HistoryItem[] {
  const result: HistoryItem[] = []
  for (const item of items) {
    const prev = result[result.length - 1]
    const sameText = prev && prev.userMessage.trim() === item.userMessage.trim()
    const closeInTime = prev && Math.abs(prev.sentAt - item.sentAt) < 12_000
    if (sameText && closeInTime) {
      result[result.length - 1] = pickRicher(prev, item)
      continue
    }
    result.push(item)
  }
  return result
}

export function mergeHistory(remote: HistoryItem[], local: HistoryItem[]): HistoryItem[] {
  if (remote.length === 0) return dedupeTurns(local)
  if (local.length === 0) return dedupeTurns(remote)

  const localQueues = new Map<string, HistoryItem[]>()
  for (const item of local) {
    const key = item.userMessage.trim()
    const queue = localQueues.get(key) ?? []
    queue.push(item)
    localQueues.set(key, queue)
  }

  const used = new Set<HistoryItem>()
  const merged: HistoryItem[] = []

  for (const remoteItem of remote) {
    const queue = localQueues.get(remoteItem.userMessage.trim()) ?? []
    const localItem = queue.shift()
    if (localItem) {
      used.add(localItem)
      merged.push({
        ...remoteItem,
        ...pickRicher(localItem, remoteItem),
        id: localItem.id ?? remoteItem.id,
        conversationId: remoteItem.conversationId ?? localItem.conversationId,
        userMessage: localItem.userMessage,
      })
    } else {
      merged.push(remoteItem)
    }
  }

  for (const item of local) {
    if (!used.has(item)) merged.push(item)
  }

  return dedupeTurns(merged).sort((a, b) => a.sentAt - b.sentAt)
}
