/**
 * 斜杠命令：本地模式切换 + 调用 REST API
 */
import type { ChatMode } from './types.js';
import { api } from './api.js';

export interface SlashResult {
  handled: boolean;
  /** 若需发聊天请求，返回 { message, mode, agent } */
  chat?: { message: string; mode: ChatMode; agent: string };
  /** 若为 REST 等异步命令，由调用方展示 output */
  fetchThen?: () => Promise<string>;
}

export function parseSlash(
  input: string,
  localState: { mode: ChatMode; agent: string }
): SlashResult {
  const raw = input.trim();
  if (!raw.startsWith('/')) {
    return { handled: false };
  }
  const lower = raw.toLowerCase();
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // 本地：模式与智能体
  if (cmd === '/plan') {
    return {
      handled: true,
      chat: {
        message: parts.slice(1).join(' ') || '请帮我编写自动化安全测试计划',
        mode: 'plan',
        agent: localState.agent,
      },
    };
  }
  if (cmd === '/start') {
    return {
      handled: true,
      chat: {
        message: '执行既定安全测试计划',
        mode: 'agent',
        agent: localState.agent,
      },
    };
  }
  if (cmd === '/ask') {
    return {
      handled: true,
      chat: {
        message: parts.slice(1).join(' ') || '',
        mode: 'ask',
        agent: localState.agent,
      },
    };
  }
  if (cmd === '/agent') {
    const arg = parts[1]?.toLowerCase();
    const agent = arg === 'super' || arg === 'superhackbot' ? 'superhackbot' : 'hackbot';
    return { handled: true };
  }

  // REST 命令
  if (cmd === '/list-tools' || cmd === '/list-agents') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{ agents: Array<{ type: string; name: string; description: string }> }>('/api/agents');
        return (r.agents ?? []).map((a) => `${a.type}: ${a.name} — ${a.description}`).join('\n');
      },
    };
  }
  if (cmd === '/system-info') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<Record<string, string>>('/api/system/info');
        return Object.entries(r)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
      },
    };
  }
  if (cmd === '/db-stats') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<Record<string, unknown>>('/api/db/stats');
        return JSON.stringify(r, null, 2);
      },
    };
  }
  if (cmd === '/model') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{
          llm_provider: string;
          ollama_model: string;
          ollama_base_url: string;
          deepseek_model?: string;
        }>('/api/system/config');
        const lines = [
          `推理后端: ${r.llm_provider}`,
          `Ollama 模型: ${r.ollama_model}`,
          `Ollama 地址: ${r.ollama_base_url}`,
        ];
        if (r.deepseek_model) lines.push(`DeepSeek 模型: ${r.deepseek_model}`);
        return lines.join('\n');
      },
    };
  }

  return { handled: false };
}

export function getAgentFromState(
  input: string,
  currentAgent: string
): string {
  const parts = input.trim().split(/\s+/);
  const cmd = (parts[0] ?? '').toLowerCase();
  if (cmd !== '/agent') return currentAgent;
  const arg = parts[1]?.toLowerCase();
  if (arg === 'super' || arg === 'superhackbot') return 'superhackbot';
  if (arg === 'hackbot' || arg === 'default') return 'hackbot';
  return currentAgent;
}

export function getModeFromSlash(input: string): ChatMode | null {
  const cmd = (input.trim().split(/\s+/)[0] ?? '').toLowerCase();
  if (cmd === '/plan') return 'plan';
  if (cmd === '/ask') return 'ask';
  if (cmd === '/start') return 'agent';
  return null;
}
