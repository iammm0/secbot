import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  addWorkspaceNode,
  bindWorkspaceSession,
  connectWorkspaceNode,
  createWorkspace,
  DEFAULT_WORKSPACE_ID,
  deleteWorkspace,
  fetchWorkspaces,
  removeWorkspaceNode,
  renameWorkspace,
  type Workspace,
  type WorkspaceNodeKind,
} from '@/lib/workspaceApi'

const ACTIVE_KEY = 'secbot-workspace'
const NODE_KEY = 'secbot-workspace-node'
export const LOCAL_NODE_ID = 'local-host'

const fallbackWorkspace = (): Workspace => ({
  id: DEFAULT_WORKSPACE_ID,
  name: '本机',
  createdAt: '',
  updatedAt: '',
  nodes: [],
  sessionIds: [],
})

let workspaces: Workspace[] = []
let activeId = readActiveId()
let nodeByWorkspace = readNodeMap()
let loading = true
let error: string | null = null
let version = 0
let listeners: Array<() => void> = []

function emit() {
  version += 1
  listeners.forEach((listener) => listener())
}

function readActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || DEFAULT_WORKSPACE_ID
  } catch {
    return DEFAULT_WORKSPACE_ID
  }
}

function writeActiveId(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* ignore quota */
  }
}

function readNodeMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(NODE_KEY) || '{}') as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeNodeMap(map: Record<string, string>) {
  nodeByWorkspace = map
  try {
    localStorage.setItem(NODE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function getActiveWorkspaceId(): string {
  return activeId
}

export function getActiveNodeId(): string {
  return nodeByWorkspace[activeId] || LOCAL_NODE_ID
}

function getSnapshot() {
  return String(version)
}

export function sessionBelongsToWorkspace(
  sessionId: string,
  workspaceId: string,
  sessionWorkspace: Map<string, string>,
): boolean {
  const mapped = sessionWorkspace.get(sessionId)
  if (mapped) return mapped === workspaceId
  return workspaceId === DEFAULT_WORKSPACE_ID
}

async function refreshWorkspaces(): Promise<void> {
  try {
    const list = await fetchWorkspaces()
    workspaces = list
    error = null
    if (!list.some((item) => item.id === activeId)) {
      activeId = list[0]?.id ?? DEFAULT_WORKSPACE_ID
      writeActiveId(activeId)
    }
  } catch (err) {
    if (workspaces.length === 0) workspaces = [fallbackWorkspace()]
    error = err instanceof Error ? err.message : '加载工作空间失败'
  } finally {
    loading = false
    emit()
  }
}

void refreshWorkspaces()

export function useWorkspaceStore() {
  useSyncExternalStore(
    (cb) => {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((listener) => listener !== cb)
      }
    },
    getSnapshot,
    getSnapshot,
  )

  const sessionWorkspace = useMemo(() => {
    const map = new Map<string, string>()
    for (const workspace of workspaces) {
      for (const sessionId of workspace.sessionIds) map.set(sessionId, workspace.id)
    }
    return map
  }, [version, workspaces])

  const active = workspaces.find((item) => item.id === activeId) ?? workspaces[0] ?? null

  const setActiveId = useCallback((id: string) => {
    activeId = id
    writeActiveId(id)
    emit()
  }, [])

  const refresh = useCallback(() => refreshWorkspaces(), [])

  const create = useCallback(async (name: string) => {
    const created = await createWorkspace(name)
    activeId = created.id
    writeActiveId(created.id)
    await refreshWorkspaces()
    return created
  }, [])

  const rename = useCallback(async (id: string, name: string) => {
    await renameWorkspace(id, name)
    await refreshWorkspaces()
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteWorkspace(id)
    if (activeId === id) {
      activeId = DEFAULT_WORKSPACE_ID
      writeActiveId(DEFAULT_WORKSPACE_ID)
    }
    await refreshWorkspaces()
  }, [])

  const addNode = useCallback(async (
    workspaceId: string,
    body: {
      name: string
      kind: Exclude<WorkspaceNodeKind, 'local'>
      address: string
      username?: string
      password?: string
      keyFile?: string
    },
  ) => {
    const node = await addWorkspaceNode(workspaceId, body)
    await refreshWorkspaces()
    return node
  }, [])

  const connectNode = useCallback(async (workspaceId: string, nodeId: string) => {
    const node = await connectWorkspaceNode(workspaceId, nodeId)
    await refreshWorkspaces()
    return node
  }, [])

  const removeNode = useCallback(async (workspaceId: string, nodeId: string) => {
    await removeWorkspaceNode(workspaceId, nodeId)
    await refreshWorkspaces()
  }, [])

  const bindSession = useCallback(async (sessionId: string, workspaceId = activeId, nodeId = getActiveNodeId()) => {
    await bindWorkspaceSession(workspaceId, sessionId, nodeId)
    await refreshWorkspaces()
  }, [])

  const setActiveNodeId = useCallback((nodeId: string, workspaceId = activeId) => {
    writeNodeMap({ ...nodeByWorkspace, [workspaceId]: nodeId })
    emit()
  }, [])

  return {
    workspaces,
    active,
    activeId: active?.id ?? activeId,
    loading,
    error,
    sessionWorkspace,
    refresh,
    setActiveId,
    create,
    rename,
    remove,
    addNode,
    connectNode,
    removeNode,
    bindSession,
    setActiveNodeId,
    activeNodeId: getActiveNodeId(),
  }
}
