import { API_BASE_URL } from './constants'
import { readApi } from './api'

export interface McpServer {
  id: string
  name: string
  command: string
  args: string[]
  cwd?: string
}

export interface SkillSummary {
  name: string
  description: string
  slug: string
  scope: string
  triggers: string[]
}

export async function fetchSettings() {
  const response = await fetch(`${API_BASE_URL}/api/settings`)
  return readApi<{ custom_instructions: string; mcp_servers: McpServer[] }>(response, '加载设置失败')
}

export async function saveInstructions(instructions: string) {
  const response = await fetch(`${API_BASE_URL}/api/settings/instructions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions }),
  })
  return readApi<{ custom_instructions: string }>(response, '保存指令失败')
}

export async function addMcpServer(input: { name: string; command: string; args: string[]; cwd?: string }) {
  const response = await fetch(`${API_BASE_URL}/api/settings/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readApi<{ server: McpServer }>(response, '添加 MCP 失败')
}

export async function removeMcpServer(id: string) {
  const response = await fetch(`${API_BASE_URL}/api/settings/mcp/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return readApi<{ server: McpServer }>(response, '删除 MCP 失败')
}

export async function fetchSkills() {
  const response = await fetch(`${API_BASE_URL}/api/skills`)
  const payload = await readApi<{ skills: SkillSummary[] }>(response, '加载技能失败')
  return payload.skills ?? []
}

export async function createSkill(input: { name: string; description?: string; triggers?: string[] }) {
  const response = await fetch(`${API_BASE_URL}/api/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readApi<SkillSummary>(response, '创建技能失败')
}

export async function deleteSkill(name: string) {
  const response = await fetch(`${API_BASE_URL}/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })
  return readApi<{ deleted: string }>(response, '删除技能失败')
}
