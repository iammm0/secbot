import { API_BASE_URL } from './constants';
import { readApi } from './api';

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
}

export interface McpConnectionStatus {
  id: string;
  name: string;
  connected: boolean;
  tools: string[];
  error?: string;
}

export interface McpCatalog {
  servers: McpServer[];
  loaded_tools: string[];
  omitted: number;
  errors: string[];
  connections: McpConnectionStatus[];
}

export interface SkillSummary {
  name: string;
  description: string;
  slug: string;
  scope: string;
  triggers: string[];
}

export async function fetchSettings() {
  const response = await fetch(`${API_BASE_URL}/api/settings`);
  return readApi<{ custom_instructions: string; mcp_servers: McpServer[] }>(
    response,
    '加载设置失败',
  );
}

export async function saveInstructions(instructions: string) {
  const response = await fetch(`${API_BASE_URL}/api/settings/instructions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions }),
  });
  return readApi<{ custom_instructions: string }>(response, '保存指令失败');
}

export async function fetchMcpCatalog() {
  const response = await fetch(`${API_BASE_URL}/api/settings/mcp`);
  return readApi<McpCatalog>(response, '加载 MCP 失败');
}

export async function addMcpServer(input: {
  name: string;
  command: string;
  args: string[];
  cwd?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/settings/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readApi<{ server: McpServer }>(response, '添加 MCP 失败');
}

export async function removeMcpServer(id: string) {
  const response = await fetch(`${API_BASE_URL}/api/settings/mcp/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return readApi<{ server: McpServer }>(response, '删除 MCP 失败');
}

export async function fetchSkills() {
  const response = await fetch(`${API_BASE_URL}/api/skills`);
  const payload = await readApi<{ skills: SkillSummary[] }>(response, '加载技能失败');
  return payload.skills ?? [];
}

export async function createSkill(input: {
  name: string;
  description?: string;
  triggers?: string[];
}) {
  const response = await fetch(`${API_BASE_URL}/api/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readApi<SkillSummary>(response, '创建技能失败');
}

export async function deleteSkill(name: string) {
  const response = await fetch(`${API_BASE_URL}/api/skills/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  return readApi<{ deleted: string }>(response, '删除技能失败');
}

export interface ExecGoSandboxStatus {
  requested: 'off' | 'process' | 'isolated';
  reported: 'off' | 'process' | 'isolated';
  label: string;
  detail: string;
  os: string | null;
  linux_sandbox: boolean | null;
  cgroup_v2: boolean | null;
  overrides: Record<string, string>;
}

export interface ExecGoSettings {
  enabled: boolean;
  auditActions: boolean;
  fallbackLocal: boolean;
  sandboxProfile: 'process' | 'isolated';
  url: string;
  runtimeUrl: string;
  cliPath: string;
}

export interface ExecGoManagedProcess {
  name: 'execgo' | 'execgo-runtime';
  running: boolean;
  managed: boolean;
  pid: number | null;
  binary: string | null;
  addr: string;
  logFile: string;
  error?: string;
}

export interface ExecGoProbeResult {
  config: ExecGoSettings;
  sibling_root: string | null;
  runtime_sibling_root?: string | null;
  cli_path: string;
  server_binary?: string | null;
  runtime_binary?: string | null;
  healthy: boolean;
  health?: Record<string, unknown>;
  capabilities?: Record<string, unknown> | null;
  sandbox?: ExecGoSandboxStatus;
  processes?: ExecGoManagedProcess[];
  error?: string;
}

export interface ExecGoSaveResult {
  config: ExecGoSettings;
  processes: ExecGoManagedProcess[];
  process_errors: string[];
}

export async function fetchExecGoSettings() {
  const response = await fetch(`${API_BASE_URL}/api/settings/execgo`);
  return readApi<ExecGoProbeResult>(response, '加载 ExecGo 设置失败');
}

export async function saveExecGoSettings(input: Partial<ExecGoSettings>) {
  const response = await fetch(`${API_BASE_URL}/api/settings/execgo`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readApi<ExecGoSaveResult>(response, '保存 ExecGo 设置失败');
}

export async function probeExecGo() {
  const response = await fetch(`${API_BASE_URL}/api/settings/execgo/probe`, { method: 'POST' });
  return readApi<ExecGoProbeResult>(response, '探测 ExecGo 失败');
}

export interface JevPublicConfig {
  enabled: boolean;
  intent: boolean;
  qaLive: boolean;
  adaptive: boolean;
  reactStop: boolean;
  context: boolean;
  baseUrl: string;
  model: string;
  confidenceMin: number;
  reactStopMin: number;
  hasApiKey: boolean;
}

export interface JevSettingsPayload {
  config: JevPublicConfig;
  healthy?: boolean;
  noul?: number;
  model?: string;
  error?: string;
}

export async function fetchJevSettings() {
  const response = await fetch(`${API_BASE_URL}/api/settings/jev`);
  return readApi<JevSettingsPayload>(response, '加载 Jev 设置失败');
}

export async function saveJevSettings(input: Partial<JevPublicConfig> & { apiKey?: string }) {
  const response = await fetch(`${API_BASE_URL}/api/settings/jev`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readApi<{ config: JevPublicConfig }>(response, '保存 Jev 设置失败');
}

export async function probeJev() {
  const response = await fetch(`${API_BASE_URL}/api/settings/jev/probe`, { method: 'POST' });
  return readApi<JevSettingsPayload>(response, '探测 Jev 失败');
}

export interface AuditRecordView {
  id: number;
  session_id: string;
  agent: string;
  step_type: string;
  content: string;
  metadata: unknown;
  timestamp: string;
}

export interface AuditListResult {
  total: number;
  records: AuditRecordView[];
}

export async function fetchAuditRecords(
  params: {
    session_id?: string;
    agent?: string;
    step_type?: string;
    q?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.session_id) query.set('session_id', params.session_id);
  if (params.agent) query.set('agent', params.agent);
  if (params.step_type) query.set('step_type', params.step_type);
  if (params.q) query.set('q', params.q);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.offset != null) query.set('offset', String(params.offset));
  const suffix = query.toString() ? `?${query}` : '';
  const response = await fetch(`${API_BASE_URL}/api/audit${suffix}`);
  return readApi<AuditListResult>(response, '加载审计记录失败');
}

export async function clearAuditRecords(sessionId?: string) {
  const suffix = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  const response = await fetch(`${API_BASE_URL}/api/audit${suffix}`, { method: 'DELETE' });
  return readApi<{ deleted: number }>(response, '清除审计记录失败');
}
