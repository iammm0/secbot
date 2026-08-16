import { useSyncExternalStore, useCallback } from 'react'
import type { ChatMode } from '@/lib/types'

export interface SessionEntry {
  id: string
  label: string
  mode: ChatMode
  createdAt: number
}

const STORAGE_KEY = 'secbot-sessions'

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
      label: typeof item.label === 'string' ? item.label : 'New Chat',
      mode: normalizeMode(item.mode),
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    }))
}

function load(): SessionEntry[] {
  try {
    return normalizeSessions(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  } catch { return [] }
}
function save(sessions: SessionEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  emit()
}

function getSnapshot() { return localStorage.getItem(STORAGE_KEY) || '[]' }

function sessionsFromSnapshot(raw: string): SessionEntry[] {
  try {
    return normalizeSessions(JSON.parse(raw))
  } catch {
    return []
  }
}

export function useSessionStore() {
  const raw = useSyncExternalStore(
    (cb) => { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb) } },
    getSnapshot,
  )
  const sessions = sessionsFromSnapshot(raw)

  const addSession = useCallback((id: string, mode: ChatMode = 'agent') => {
    const list = load()
    if (list.find((s) => s.id === id)) return
    list.unshift({ id, label: 'New Chat', mode, createdAt: Date.now() })
    save(list)
  }, [])

  const removeSession = useCallback((id: string) => {
    save(load().filter((s) => s.id !== id))
  }, [])

  const updateLabel = useCallback((id: string, label: string) => {
    const list = load()
    const s = list.find((x) => x.id === id)
    if (s && s.label === 'New Chat') { s.label = label.slice(0, 30); save(list) }
  }, [])

  const updateMode = useCallback((id: string, mode: ChatMode) => {
    const list = load()
    const s = list.find((x) => x.id === id)
    if (!s || s.mode === mode) return
    s.mode = mode
    save(list)
  }, [])

  return { sessions, addSession, removeSession, updateLabel, updateMode }
}
