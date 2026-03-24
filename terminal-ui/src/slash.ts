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

【高级（高风险操作，需确认）】
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

  // 本地：模式与执行角色（ask / plan / agent 执行；/task 与 /agent 等价）
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
  if (cmd === '/task' || cmd === '/agent') {
    return {
      handled: true,
      chat: {
        message: parts.slice(1).join(' ') || '',
        mode: 'agent',
        agent: localState.agent,
      },
    };
  }
  if (cmd === '/plan') {
    return {
      handled: true,
      chat: {
        message: parts.slice(1).join(' ') || '',
        mode: 'plan',
        agent: localState.agent,
      },
    };
  }
  // /accept — approve the pending plan and switch from plan mode to agent mode
  if (cmd === '/accept') {
    return {
      handled: true,
      fetchThen: async () => {
        try {
          const r = await api.post<{ success: boolean; message: string; plan_text?: string }>(
            '/api/chat/plan-exit',
            { session_id: '', plan_text: parts.slice(1).join(' ') || '' }
          );
          return r.message || (r.success ? '计划已批准，切换到执行模式。' : '计划未批准，仍在规划模式。');
        } catch (e: any) {
          return `plan-exit 失败: ${e.message ?? e}`;
        }
      },
    };
  }

  // /help — 静态展示集成的安全工具，不调 API
  if (cmd === '/help') {
    return {
      handled: true,
      fetchThen: () => Promise.resolve(HELP_TOOLS_TEXT),
    };
  }
  if (cmd === '/mode') {
    return {
      handled: true,
      fetchThen: () =>
        Promise.resolve(
          [
            `当前 TUI 模式: ${localState.mode}`,
            `可切换: /ask, /plan, /task（/agent 同义）`,
            `说明: /task 与 /agent 均为执行模式，沿用当前执行角色；/plan 为仅规划不执行`,
            `/accept — 批准当前计划并切换到执行模式（plan → agent）`,
            `ACP 网关支持模式: agent / plan / ask`,
          ].join('\n')
        ),
    };
  }
  if (cmd === '/opencode') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{
          capabilities: Record<string, boolean>;
          feature_flags: Record<string, string>;
          tui_switchable_modes: string[];
          acp_modes: string[];
          acp_gateway_entry: string;
        }>('/api/system/opencode/capabilities');
        const lines: string[] = ['SECBOT 兼容能力', ''];
        lines.push('能力:');
        for (const [k, v] of Object.entries(r.capabilities ?? {})) {
          lines.push(`  ${k.padEnd(24)} : ${v ? 'enabled' : 'disabled'}`);
        }
        lines.push('', 'Feature Flags:');
        for (const [k, v] of Object.entries(r.feature_flags ?? {})) {
          lines.push(`  ${k.padEnd(24)} : ${v}`);
        }
        lines.push('', `TUI 可切换模式: ${(r.tui_switchable_modes ?? []).join(', ')}`);
        lines.push(`ACP 支持模式: ${(r.acp_modes ?? []).join(', ')}`);
        lines.push(`ACP 启动命令: ${r.acp_gateway_entry}`);
        return lines.join('\n');
      },
    };
  }
  if (cmd === '/acp-status') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{ gateway_module: string; transport: string; methods: string[] }>('/api/system/opencode/acp');
        const lines = [
          `ACP 网关模块: ${r.gateway_module}`,
          `传输: ${r.transport}`,
          '',
          '方法:',
          ...(r.methods ?? []).map((m) => `  - ${m}`),
        ];
        return lines.join('\n');
      },
    };
  }
  if (cmd === '/mcp-status') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{
          count: number;
          servers: Array<{ name: string; type: string; enabled: boolean; timeout: number; has_command: boolean; url?: string }>;
        }>('/api/system/opencode/mcp');
        const lines: string[] = [`MCP 服务: ${r.count}`, ''];
        for (const s of r.servers ?? []) {
          lines.push(
            `- ${s.name} [${s.type}] enabled=${s.enabled ? 'yes' : 'no'} timeout=${s.timeout}s` +
              (s.url ? ` url=${s.url}` : '') +
              (!s.url ? ` has_command=${s.has_command ? 'yes' : 'no'}` : '')
          );
        }
        if (!r.servers?.length) lines.push('(未发现 MCP 服务配置)');
        return lines.join('\n');
      },
    };
  }
  if (cmd === '/mcp-add') {
    return {
      handled: true,
      fetchThen: async () => {
        const kind = (parts[1] ?? '').toLowerCase();
        const name = parts[2] ?? '';
        if (!kind || !name) {
          return '用法:\n  /mcp-add local <name> <command...>\n  /mcp-add remote <name> <url>';
        }
        if (kind === 'local') {
          const command = parts.slice(3);
          if (!command.length) return 'local 类型需要 command，例如: /mcp-add local fs node server.js';
          const r = await api.post<{ success: boolean; message: string }>('/api/system/opencode/mcp/add', {
            type: 'local',
            name,
            command,
          });
          return r.message;
        }
        if (kind === 'remote') {
          const url = parts[3] ?? '';
          if (!url) return 'remote 类型需要 url，例如: /mcp-add remote mysrv https://example.com/mcp';
          const r = await api.post<{ success: boolean; message: string }>('/api/system/opencode/mcp/add', {
            type: 'remote',
            name,
            url,
          });
          return r.message;
        }
        return '仅支持 local/remote';
      },
    };
  }
  if (cmd === '/skills') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{ count: number; truncated: boolean; skills: Array<{ name: string; description?: string }> }>(
          '/api/system/opencode/skills'
        );
        const lines = [`发现技能: ${r.count}`, ''];
        for (const s of r.skills ?? []) {
          lines.push(`- ${s.name}: ${s.description ?? ''}`);
        }
        if (r.truncated) lines.push('', '(仅展示前 30 条)');
        return lines.join('\n');
      },
    };
  }
  if (cmd === '/permissions') {
    return {
      handled: true,
      fetchThen: async () => {
        const r = await api.get<{ policies: Record<string, { default: string }> }>('/api/system/opencode/permissions');
        const lines = ['权限策略:'];
        for (const [cat, policy] of Object.entries(r.policies ?? {})) {
          lines.push(`- ${cat}: ${policy.default}`);
        }
        return lines.join('\n');
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

  return { handled: false };
}

export function getAgentFromState(
  input: string,
  currentAgent: string
): string {
  return currentAgent;
}

export function getModeFromSlash(input: string): ChatMode | null {
  const cmd = (input.trim().split(/\s+/)[0] ?? '').toLowerCase();
  if (cmd === '/ask') return 'ask';
  if (cmd === '/plan') return 'plan';
  if (cmd === '/task' || cmd === '/agent' || cmd === '/accept') return 'agent';
  return null;
}
