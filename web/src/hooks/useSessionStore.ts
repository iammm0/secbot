import { useSyncExternalStore, useCallback } from 'react'
export interface SessionEntry {
  id: string
  label: string
  mode: 'agent'
  createdAt: number
}

const STORAGE_KEY = 'secbot-sessions'

let listeners: Array<() => void> = []
function emit() { listeners.forEach((l) => l()) }

function normalizeSessions(raw: unknown): SessionEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Partial<SessionEntry> & { id: string } => Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
    .map((item) => ({
      id: item.id,
      label: typeof item.label === 'string' ? item.label : 'New Chat',
      mode: 'agent',
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

  const addSession = useCallback((id: string) => {
    const list = load()
    if (list.find((s) => s.id === id)) return
    list.unshift({ id, label: 'New Chat', mode: 'agent', createdAt: Date.now() })
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

  return { sessions, addSession, removeSession, updateLabel }
}
