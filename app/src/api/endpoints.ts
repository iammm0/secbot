// ===================================================================
// API 端点调用方法
// ===================================================================

import api from './client';
import type {
  ChatRequest,
  ChatResponse,
  AgentListResponse,
  SystemInfoResponse,
  SystemStatusResponse,
  DefenseScanResponse,
  DefenseStatusResponse,
  BlockedIpsResponse,
  DiscoverResponse,
  TargetListResponse,
  AuthorizationListResponse,
  DbStatsResponse,
  DbHistoryResponse,
  DbClearResponse,
} from '../types';

// -- Chat --
export const chatSync = (req: ChatRequest) =>
  api.post<ChatResponse>('/api/chat/sync', req);

// -- Agents --
export const listAgents = () =>
  api.get<AgentListResponse>('/api/agents');

export const clearMemory = (agent?: string) =>
  api.post('/api/agents/clear', { agent });

// -- System --
export const getSystemInfo = () =>
  api.get<SystemInfoResponse>('/api/system/info');

export const getSystemStatus = () =>
  api.get<SystemStatusResponse>('/api/system/status');

// -- Defense --
export const defenseScan = () =>
  api.post<DefenseScanResponse>('/api/defense/scan');

export const getDefenseStatus = () =>
  api.get<DefenseStatusResponse>('/api/defense/status');

export const getBlockedIps = () =>
  api.get<BlockedIpsResponse>('/api/defense/blocked');

export const unblockIp = (ip: string) =>
  api.post('/api/defense/unblock', { ip });

export const getDefenseReport = (type = 'vulnerability') =>
  api.get(`/api/defense/report?type=${type}`);

// -- Network --
export const discoverNetwork = (network?: string) =>
  api.post<DiscoverResponse>(
    '/api/network/discover',
    network !== undefined ? { network } : {},
  );

export const getTargets = (authorizedOnly = false) =>
  api.get<TargetListResponse>(
    `/api/network/targets?authorized_only=${authorizedOnly}`,
  );

export const getAuthorizations = () =>
  api.get<AuthorizationListResponse>('/api/network/authorizations');

export const authorizeTarget = (data: {
  target_ip: string;
  username: string;
  password?: string;
  key_file?: string;
  auth_type?: string;
  description?: string;
}) => api.post('/api/network/authorize', data);

export const revokeAuthorization = (targetIp: string) =>
  api.delete(`/api/network/authorize/${encodeURIComponent(targetIp)}`);

// -- Database --
export const getDbStats = () =>
  api.get<DbStatsResponse>('/api/db/stats');

export const getDbHistory = (params?: {
  agent?: string;
  limit?: number;
  session_id?: string;
}) => {
  const search = new URLSearchParams();
  if (params?.agent) search.set('agent', params.agent);
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.session_id) search.set('session_id', params.session_id);
  const qs = search.toString();
  return api.get<DbHistoryResponse>(`/api/db/history${qs ? `?${qs}` : ''}`);
};

export const clearDbHistory = (params?: {
  agent?: string;
  session_id?: string;
}) => {
  const search = new URLSearchParams();
  if (params?.agent) search.set('agent', params.agent);
  if (params?.session_id) search.set('session_id', params.session_id);
  const qs = search.toString();
  return api.delete<DbClearResponse>(`/api/db/history${qs ? `?${qs}` : ''}`);
};
