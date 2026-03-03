/**
 * 斜杠命令：本地模式切换 + 调用 REST API + 静态 /help
 */
import type { ChatMode } from './types.js';
import { api } from './api.js';

/** SECBOT 集成的安全工具（静态，不调 API）— 供 /help 展示 */
export const HELP_TOOLS_TEXT = `SECBOT 集成的安全工具

【核心】
  port_scan     — 端口扫描
  service_detect — 服务识别
  vuln_scan     — 漏洞扫描
  recon         — 侦察信息收集

【网络】
  网络发现、目标管理、DNS/Whois/Ping/Traceroute、SSL 分析等

【防御】
  防御扫描、拦截状态、放行/报告

【Web】
  Web 扫描、爬虫、Web 研究

【其他】
  OSINT、协议探测、报告、云安全、系统命令等

【高级（仅 SuperHackbot，需确认）】
  attack_test   — 攻击测试
  exploit       — 漏洞利用

输入 / 可查看全部斜杠命令。`;

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
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // 本地：模式与智能体（仅 ask / task / agent，已移除 plan、/start）
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
  if (cmd === '/task') {
    return {
      handled: true,
      chat: {
        message: parts.slice(1).join(' ') || '',
        mode: 'agent',
        agent: localState.agent,
      },
    };
  }
  if (cmd === '/agent') {
    const arg = parts[1]?.toLowerCase();
    const agent = arg === 'super' || arg === 'superhackbot' ? 'superhackbot' : 'hackbot';
    return { handled: true };
  }

  // /help — 静态展示集成的安全工具，不调 API
  if (cmd === '/help') {
    return {
      handled: true,
      fetchThen: () => Promise.resolve(HELP_TOOLS_TEXT),
    };
  }
  if (cmd === '/list-agents') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{ agents: Array<{ type: string; name: string; description: string }> }>('/api/agents');
        return (r.agents ?? []).map((a) => `${a.type}: ${a.name} — ${a.description}`).join('\n');
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
  if (cmd === '/ask') return 'ask';
  if (cmd === '/task') return 'agent';
  return null;
}
