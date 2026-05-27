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

function parseOptionValues(parts: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] !== flag) continue;
    const segment: string[] = [];
    let j = i + 1;
    while (j < parts.length && !parts[j].startsWith('--')) {
      segment.push(parts[j]);
      j += 1;
    }
    if (segment.length > 0) {
      values.push(segment.join(' '));
    }
    i = j - 1;
  }
  return values;
}

function parseOptionValue(parts: string[], flag: string): string | undefined {
  return parseOptionValues(parts, flag)[0];
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

  // 兼容旧命令：/ask 与 /task 不再切换模式，只把后续文本按 agent 模式发送。
  if (cmd === '/ask') {
    return {
      handled: true,
      chat: {
        message: parts.slice(1).join(' ') || '',
        mode: 'agent',
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
    const agent = arg === 'super' || arg === 'superhackbot' ? 'superhackbot' : 'secbot-cli';
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
  if (cmd === '/tools') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{
          total: number;
          basic_count: number;
          advanced_count: number;
          categories: Array<{ id: string; name: string; count: number; tools: Array<{ name: string; description: string }> }>;
        }>('/api/tools');
        const lines: string[] = [
          `SECBOT 内置工具`,
          `总计: ${r.total} 个（基础 ${r.basic_count}，高级 ${r.advanced_count}）`,
          '',
        ];
        for (const cat of r.categories ?? []) {
          lines.push(`【${cat.name}】${cat.count} 个`);
          for (const t of cat.tools ?? []) {
            lines.push(`  ${t.name.padEnd(22)} — ${t.description}`);
          }
          lines.push('');
        }
        return lines.join('\n');
      },
    };
  }
  if (cmd === '/skills') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{ skills: Array<{ slug: string; description: string; scope: string }> }>('/api/skills');
        const lines = ['SECBOT Skills', ''];
        for (const skill of r.skills ?? []) {
          lines.push(`${skill.slug} [${skill.scope}] — ${skill.description}`);
        }
        return lines.join('\n');
      },
    };
  }
  if (cmd === '/skill') {
    const name = parts[1]?.trim();
    return {
      handled: true,
      fetchThen: async () => {
        if (!name) {
          return '用法: /skill <name>';
        }
        const r = await api.get<{ slug: string; description: string; body: string; triggers: string[]; tags: string[] }>(`/api/skills/${encodeURIComponent(name)}`);
        return [
          `# ${r.slug}`,
          '',
          r.description,
          '',
          `triggers: ${(r.triggers ?? []).join(', ')}`,
          `tags: ${(r.tags ?? []).join(', ')}`,
          '',
          r.body,
        ].join('\n');
      },
    };
  }
  if (cmd === '/create-skill') {
    const name = parts[1]?.trim();
    return {
      handled: true,
      fetchThen: async () => {
        if (!name) {
          return '用法: /create-skill <name> [--description 文本] [--trigger xxx] [--tag xxx] [--prerequisite xxx] [--author xxx]';
        }
        const payload = {
          name,
          description: parseOptionValue(parts, '--description'),
          author: parseOptionValue(parts, '--author'),
          tags: parseOptionValues(parts, '--tag'),
          triggers: parseOptionValues(parts, '--trigger'),
          prerequisites: parseOptionValues(parts, '--prerequisite'),
        };
        const r = await api.post<{ slug: string; relativeDir: string; description: string }>('/api/skills', payload);
        return `已创建 skill ${r.slug}\n路径: ${r.relativeDir}\n描述: ${r.description}`;
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
  if (arg === 'secbot-cli' || arg === 'default') return 'secbot-cli';
  return currentAgent;
}

export function getModeFromSlash(input: string): ChatMode | null {
  const cmd = (input.trim().split(/\s+/)[0] ?? '').toLowerCase();
  if (cmd === '/ask' || cmd === '/task') return 'agent';
  return null;
}
