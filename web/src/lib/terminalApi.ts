import { API_BASE_URL } from './constants'
import { readApi } from './api'

export interface TerminalSnapshot {
  session_id: string
  alive: boolean
  idle_seconds: number
  pid: number | null
  cwd?: string
  shell?: string
  last_command?: string
  preview: string
}

export async function fetchTerminals(): Promise<TerminalSnapshot[]> {
  const response = await fetch(`${API_BASE_URL}/api/terminals`)
  const payload = await readApi<{ sessions: TerminalSnapshot[] }>(response, '加载终端失败')
  return payload.sessions ?? []
}

export async function closeTerminal(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/terminals/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
  await readApi(response, '关闭终端失败')
}
