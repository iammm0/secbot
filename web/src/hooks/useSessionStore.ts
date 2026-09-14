import { useSyncExternalStore, useCallback } from 'react'
import type { ChatMode } from '@/lib/types'
import { DEFAULT_SESSION_LABEL } from '@/lib/copy'
import { deleteChatSession, fetchChatSessions, patchChatSession } from '@/lib/chatApi'

function isDefaultSessionLabel(label: string): boolean {
  return (
    label === DEFAULT_SESSION_LABEL ||
    label === 'New Chat' ||
    label === '新建 Agent' ||
    label === '新对话'
  )
}

export interface SessionEntry {
  id: string
  label: string
  mode: ChatMode
  createdAt: number
  updatedAt: number
  ephemeral?: boolean
}

const STORAGE_KEY = 'secbot-sessions'
const CACHE_TTL_MS = 5 * 60 * 1000

let sessions: SessionEntry[] = loadCache()
let listeners: Array<() => void> = []
function emit() { listeners.forEach((l) => l()) }

function normalizeMode(_value: unknown): ChatMode {
  return 'agent'
}

function normalizeSessions(raw: unknown): SessionEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Partial<SessionEntry> & { id: string } => Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
    .map((item) => ({
      id: item.id,
      label: typeof item.label === 'string' && item.label && item.label !== 'New Chat'
        ? item.label
        : DEFAULT_SESSION_LABEL,
      mode: normalizeMode(item.mode),
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : (typeof item.createdAt === 'number' ? item.createdAt : Date.now()),
      ephemeral: item.ephemeral === true,
    }))
}

function loadCache(): SessionEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as { savedAt?: number; sessions?: unknown }
    if (!parsed || typeof parsed !== 'object') return []
    if (typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt > CACHE_TTL_MS) return []
    return normalizeSessions(parsed.sessions)
  } catch {
    return []
  }
}

function writeCache(list: SessionEntry[]) {
  sessions = list
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), sessions: list }))
  } catch {
    /* quota */
  }
  emit()
}

function getSnapshot() {
  return JSON.stringify(sessions)
}

export function useSessionStore() {
  const raw = useSyncExternalStore(
    (cb) => { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb) } },
    getSnapshot,
    getSnapshot,
  )
  const list = normalizeSessions(JSON.parse(raw) as unknown)

  const addSession = useCallback((id: string, mode: ChatMode = 'agent') => {
    if (sessions.find((s) => s.id === id)) return
    writeCache([{ id, label: DEFAULT_SESSION_LABEL, mode, createdAt: Date.now(), updatedAt: Date.now(), ephemeral: true }, ...sessions])
  }, [])

  const removeSession = useCallback((id: string) => {
    writeCache(sessions.filter((s) => s.id !== id))
    void deleteChatSession(id).catch(() => undefined)
  }, [])

  const updateLabel = useCallback((id: string, label: string) => {
    const next = sessions.map((item) => {
      if (item.id !== id) return item
      if (!isDefaultSessionLabel(item.label)) return item
      return { ...item, label: label.slice(0, 30), updatedAt: Date.now(), ephemeral: false }
    })
    writeCache(next)
    const updated = next.find((item) => item.id === id)
    if (updated && !isDefaultSessionLabel(updated.label)) {
      void patchChatSession(id, updated.label).catch(() => undefined)
    }
  }, [])

  const updateMode = useCallback((id: string, mode: ChatMode) => {
    writeCache(sessions.map((item) => (item.id === id ? { ...item, mode } : item)))
  }, [])

  const touchSession = useCallback((id: string) => {
    writeCache(sessions.map((item) => (item.id === id ? { ...item, updatedAt: Date.now() } : item)))
  }, [])

  const hydrateFromServer = useCallback((remote: Array<{ sessionId: string; title: string; createdAt: string; updatedAt: string }>) => {
    const ephemeral = sessions.filter((item) => item.ephemeral)
    const byId = new Map<string, SessionEntry>()
    for (const session of remote) {
      const id = session.sessionId.trim() || 'default'
      const title = session.title.trim().slice(0, 48) || DEFAULT_SESSION_LABEL
      const createdAt = Date.parse(session.createdAt) || Date.now()
      const updatedAt = Date.parse(session.updatedAt) || createdAt
      byId.set(id, { id, label: title, mode: 'agent', createdAt, updatedAt })
    }
    for (const local of ephemeral) {
      if (!byId.has(local.id)) byId.set(local.id, local)
    }
    writeCache([...byId.values()].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)))
  }, [])

  const refreshFromServer = useCallback(async () => {
    const payload = await fetchChatSessions()
    hydrateFromServer(payload.sessions ?? [])
  }, [hydrateFromServer])

  return { sessions: list, addSession, removeSession, updateLabel, updateMode, touchSession, hydrateFromServer, refreshFromServer }
}
