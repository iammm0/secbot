import { API_BASE_URL } from './constants'
import { readApi } from './api'

export type WorkspaceNodeKind = 'local' | 'secbot' | 'ssh'
export type WorkspaceNodeStatus = 'unknown' | 'online' | 'offline'

export interface WorkspaceNode {
  id: string
  workspaceId: string
  name: string
  kind: WorkspaceNodeKind
  address: string
  status: WorkspaceNodeStatus
  createdAt: string
  hostname?: string
  error?: string
  ip?: string
  username?: string
  openPorts?: number[]
  services?: Record<string, string>
  osType?: string
  probedAt?: string
}

export interface AttackChainStep {
  id: string
  label: string
  detail: string
  status: 'done' | 'active' | 'preview' | 'blocked'
}

export interface NodeSurfacePreview {
  node: WorkspaceNode
  attackChain: AttackChainStep[]
}

export interface Workspace {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  nodes: WorkspaceNode[]
  sessionIds: string[]
}

export const DEFAULT_WORKSPACE_ID = 'local'

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const response = await fetch(`${API_BASE_URL}/api/workspaces`)
  const payload = await readApi<{ workspaces: Workspace[] }>(response, '加载工作空间失败')
  return payload.workspaces ?? []
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const response = await fetch(`${API_BASE_URL}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return readApi<Workspace>(response, '创建工作空间失败')
}

export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
  const response = await fetch(`${API_BASE_URL}/api/workspaces/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return readApi<Workspace>(response, '重命名工作空间失败')
}

export async function deleteWorkspace(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/workspaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  await readApi(response, '删除工作空间失败')
}

export async function addWorkspaceNode(
  workspaceId: string,
  body: {
    name: string
    kind: Exclude<WorkspaceNodeKind, 'local'>
    address: string
    username?: string
    password?: string
    keyFile?: string
  },
): Promise<WorkspaceNode> {
  const response = await fetch(`${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return readApi<WorkspaceNode>(response, '添加主机节点失败')
}

export async function connectWorkspaceNode(workspaceId: string, nodeId: string): Promise<WorkspaceNode> {
  const response = await fetch(
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/nodes/${encodeURIComponent(nodeId)}/connect`,
    { method: 'POST' },
  )
  return readApi<WorkspaceNode>(response, '连接主机节点失败')
}

export async function probeWorkspaceNode(
  workspaceId: string,
  nodeId: string,
): Promise<NodeSurfacePreview> {
  const response = await fetch(
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/nodes/${encodeURIComponent(nodeId)}/probe`,
    { method: 'POST' },
  )
  return readApi<NodeSurfacePreview>(response, '探测主机节点失败')
}

export async function fetchNodeSurface(
  workspaceId: string,
  nodeId: string,
): Promise<NodeSurfacePreview> {
  const response = await fetch(
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/nodes/${encodeURIComponent(nodeId)}/surface`,
  )
  return readApi<NodeSurfacePreview>(response, '加载节点拓扑失败')
}

export async function removeWorkspaceNode(workspaceId: string, nodeId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: 'DELETE' },
  )
  await readApi(response, '删除主机节点失败')
}

export async function bindWorkspaceSession(
  workspaceId: string,
  sessionId: string,
  nodeId?: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, nodeId }),
  })
  await readApi(response, '关联对话失败')
}
