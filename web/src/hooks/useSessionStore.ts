import { useSyncExternalStore, useCallback } from 'react'
import type { ChatMode } from '@/lib/types'

export interface SessionEntry {
  id: string
  label: string
  mode: ChatMode
  createdAt: number
}

const STORAGE_KEY = 'secbot-sessions'
const MODE_KEY = 'secbot-mode'

let listeners: Array<() => void> = []
function emit() { listeners.forEach((l) => l()) }

function load(): SessionEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function save(sessions: SessionEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  emit()
}

function getSnapshot() { return localStorage.getItem(STORAGE_KEY) || '[]' }

export function useSessionStore() {
  const raw = useSyncExternalStore(
    (cb) => { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb) } },
    getSnapshot,
  )
  const sessions: SessionEntry[] = JSON.parse(raw)

  const addSession = useCallback((id: string, mode: ChatMode) => {
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

  const getMode = useCallback((): ChatMode => {
    return (localStorage.getItem(MODE_KEY) as ChatMode) || 'agent'
  }, [])

  const setMode = useCallback((mode: ChatMode) => {
    localStorage.setItem(MODE_KEY, mode)
    emit()
  }, [])

  return { sessions, addSession, removeSession, updateLabel, getMode, setMode }
}
