import React, { useState, useEffect } from 'react';
import { Box, useInput } from 'ink';
import fs from 'node:fs/promises';
import path from 'node:path';
import { useCommand, useToast, useRoute, useSync, useLocal, useKeybind } from './contexts/index.js';
import { inkKeyToParsedKey } from './contexts/KeybindContext.js';
import { useDialog } from './contexts/DialogContext.js';
import { api } from './api.js';
import { tuiEvents } from './events.js';
import { Toast } from './components/Toast.js';
import { Dialog } from './components/Dialog.js';
import { CommandPanel } from './components/CommandPanel.js';
import { ModelConfigDialog } from './components/ModelConfigDialog.js';
import { LogLevelDialog } from './components/LogLevelDialog.js';
import { RestResultDialog } from './components/RestResultDialog.js';
import { HELP_TOOLS_TEXT } from './slash.js';
import { HomeView } from './views/HomeView.js';
import { SessionView } from './views/SessionView.js';

interface AppProps {
  columns?: number;
  rows?: number;
}

const DEFAULT_COLUMNS = 100;
const DEFAULT_ROWS = 32;
const LOG_TAIL_LINES = 120;

async function readRecentRuntimeLogs(): Promise<string> {
  const cwd = process.cwd();
  const targets = [
    { title: 'BACKEND-RUNTIME', file: path.join(cwd, '..', 'logs', 'backend-runtime.log') },
    { title: 'TUI-RUNTIME', file: path.join(cwd, '..', 'logs', 'tui-runtime.log') },
  ];
  const sections: string[] = [];
  for (const item of targets) {
    try {
      const text = await fs.readFile(item.file, 'utf8');
      const lines = text.split(/\r?\n/).filter(Boolean);
      const tail = lines.slice(-LOG_TAIL_LINES);
      sections.push(`## ${item.title}\n${tail.join('\n') || '(empty)'}`);
    } catch {
      sections.push(`## ${item.title}\n(log file not found)`);
    }
  }
  return sections.join('\n\n');
}

export function App({ columns: propsColumns, rows: propsRows }: AppProps) {
  const stdout = typeof process !== 'undefined' && process.stdout;
  const [dimensions, setDimensions] = useState(() => {
    const s = stdout as NodeJS.WriteStream & { columns?: number; rows?: number };
    return {
      columns: s?.columns ?? propsColumns ?? DEFAULT_COLUMNS,
      rows: s?.rows ?? propsRows ?? DEFAULT_ROWS,
    };
  });
  useEffect(() => {
    const stream = stdout as NodeJS.WriteStream & {
      on?(e: 'resize', fn: () => void): void;
      off?(e: 'resize', fn: () => void): void;
      columns?: number;
      rows?: number;
    };
    if (!stream?.on) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        setDimensions({
          columns: (stream.columns ?? DEFAULT_COLUMNS),
          rows: (stream.rows ?? DEFAULT_ROWS),
        });
      }, 150);
    };
    stream.on('resize', onResize);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      stream.off?.('resize', onResize);
    };
  }, [stdout]);

  const { columns, rows } = dimensions;
  const dialog = useDialog();
  const keybind = useKeybind();
  const { register, trigger } = useCommand();
  const toast = useToast();
  const { route } = useRoute();
  const sync = useSync();
  const local = useLocal();
  const { sendMessage, setRESTOutput } = sync;
  const { mode, agent, setMode } = local;

  useEffect(() => {
    const unsubToast = tuiEvents.onToastShow((opts) => {
      toast.show({ message: opts.message, title: opts.title, variant: opts.variant });
    });
    const unsubCmd = tuiEvents.onCommandExecute((opts) => trigger(opts.command));
    return () => {
      unsubToast();
      unsubCmd();
    };
  }, [toast, trigger]);

  useEffect(() => {
    const unregs = [
      register({ title: 'Ask 模式（仅问答）', value: '/ask', category: '会话', slash: '/ask', onSelect: ({ close }) => { setMode('ask'); toast.show({ message: '已切换到 ask 模式', variant: 'success' }); close(); } }),
      register({ title: 'Plan 模式（仅规划）', value: '/plan', category: '会话', slash: '/plan', onSelect: ({ close }) => { setMode('plan'); toast.show({ message: '已切换到 plan 模式', variant: 'success' }); close(); } }),
      register({ title: 'Agent 执行模式（/task 与 /agent 等价）', value: '/task', category: '会话', slash: '/task', onSelect: ({ close }) => { setMode('agent'); toast.show({ message: '已切换到 agent 执行模式', variant: 'success' }); close(); } }),
      register({ title: '采纳上一份计划并执行', value: '/accept', category: '会话', slash: '/accept', onSelect: ({ close }) => { close(); } }),
      register({ title: '丢弃上一份计划', value: '/reject', category: '会话', slash: '/reject', onSelect: ({ close }) => { close(); } }),
      register({
        title: '帮助（集成安全工具）',
        value: '/help',
        category: 'REST',
        slash: '/help',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="SECBOT 帮助"
              fetchContent={() => Promise.resolve(HELP_TOOLS_TEXT)}
            />
          );
        },
      }),
      register({
        title: '当前模型/配置',
        value: '/model',
        category: 'REST',
        slash: '/model',
        onSelect: ({ close }) => {
          close();
          dialog.replace(<ModelConfigDialog />);
        },
      }),
      register({
        title: '日志级别（INFO/DEBUG）',
        value: '/log-level',
        category: '系统',
        slash: '/log-level',
        onSelect: ({ close }) => {
          close();
          dialog.replace(<LogLevelDialog />);
        },
      }),
      register({
        title: '运行日志（最近 120 行）',
        value: '/logs',
        category: '系统',
        slash: '/logs',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="运行日志（最近 120 行）"
              fetchContent={readRecentRuntimeLogs}
            />
          );
        },
      }),
      register({
        title: '内置工具（数量与种类）',
        value: '/tools',
        category: 'REST',
        slash: '/tools',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="SECBOT 内置工具"
              fetchContent={() =>
                api.get<{
                  total: number;
                  basic_count: number;
                  advanced_count: number;
                  categories: Array<{ name: string; count: number; tools: Array<{ name: string; description: string }> }>;
                }>('/api/tools').then((r) => {
                  const lines: string[] = [
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
                })
              }
            />
          );
        },
      }),
      register({
        title: '兼容能力总览',
        value: '/opencode',
        category: 'REST',
        slash: '/opencode',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="SECBOT 兼容能力"
              fetchContent={() =>
                api.get<{
                  capabilities: Record<string, boolean>;
                  feature_flags: Record<string, string>;
                  tui_switchable_modes: string[];
                  acp_modes: string[];
                  acp_gateway_entry: string;
                }>('/api/system/opencode/capabilities').then((r) => {
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
                })
              }
            />
          );
        },
      }),
      register({
        title: 'ACP 网关能力',
        value: '/acp-status',
        category: 'REST',
        slash: '/acp-status',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="ACP 网关能力"
              fetchContent={() =>
                api.get<{ gateway_module: string; transport: string; methods: string[] }>('/api/system/opencode/acp').then((r) =>
                  [`ACP 网关模块: ${r.gateway_module}`, `传输: ${r.transport}`, '', '方法:', ...(r.methods ?? []).map((m) => `  - ${m}`)].join('\n')
                )
              }
            />
          );
        },
      }),
      register({
        title: 'MCP 服务状态',
        value: '/mcp-status',
        category: 'REST',
        slash: '/mcp-status',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="MCP 服务状态"
              fetchContent={() =>
                api.get<{ count: number; servers: Array<{ name: string; type: string; enabled: boolean; timeout: number; has_command: boolean; url?: string }> }>('/api/system/opencode/mcp').then((r) => {
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
                })
              }
            />
          );
        },
      }),
      register({
        title: '统一技能列表',
        value: '/skills',
        category: 'REST',
        slash: '/skills',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="统一技能列表"
              fetchContent={() =>
                api.get<{ count: number; truncated: boolean; skills: Array<{ name: string; description?: string }> }>('/api/system/opencode/skills').then((r) => {
                  const lines = [`发现技能: ${r.count}`, ''];
                  for (const s of r.skills ?? []) lines.push(`- ${s.name}: ${s.description ?? ''}`);
                  if (r.truncated) lines.push('', '(仅展示前 30 条)');
                  return lines.join('\n');
                })
              }
            />
          );
        },
      }),
      register({
        title: '权限策略状态',
        value: '/permissions',
        category: 'REST',
        slash: '/permissions',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="权限策略状态"
              fetchContent={() =>
                api.get<{ policies: Record<string, { default: string }> }>('/api/system/opencode/permissions').then((r) =>
                  ['权限策略:', ...Object.entries(r.policies ?? {}).map(([cat, p]) => `- ${cat}: ${p.default}`)].join('\n')
                )
              }
            />
          );
        },
      }),
      register({
        title: '模式说明',
        value: '/mode',
        category: '会话',
        slash: '/mode',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="模式说明"
              fetchContent={() =>
                Promise.resolve(
                  ['当前 TUI 支持切换: /ask, /plan, /task（/agent 与 /task 等价）', '/plan 生成计划后可用 /accept 执行，或 /reject 丢弃', '执行模式沿用当前 Agent 角色', 'ACP 网关支持: agent / plan / ask'].join('\n')
                )
              }
            />
          );
        },
      }),
    ];
    return () => { unregs.forEach((u) => u()); };
  }, [register, setRESTOutput, setMode, dialog, toast]);

  useInput((input, key) => {
    const evt = inkKeyToParsedKey(input, key);
    if (hasDialog && (keybind.match('escape', evt) || input === '\u001b')) {
      dialog.pop();
      return;
    }
    if (keybind.match('exit', evt)) {
      if (dialog.stack.length > 0) {
        dialog.clear();
        return;
      }
    }
    // 弹窗内 Esc 由各弹窗组件自行处理，避免统一 clear() 破坏多步骤返回流程。
    if (keybind.match('command_list', evt)) {
      dialog.replace(<CommandPanel />, () => dialog.clear());
      return;
    }
    if (!hasDialog && keybind.match('agent_switch', evt)) {
      trigger('/task');
      return;
    }
  });

  const hasDialog = dialog.stack.length > 0;

  return (
    <Box flexDirection="column" width={columns} height={rows} padding={1}>
      <Toast />
      {hasDialog ? (
        /* 弹窗打开时只渲染遮罩层，不渲染主内容，完全覆盖原层（与 OpenCode Select model 一致） */
        <Box flexGrow={1} minHeight={0} width={columns}>
          <Dialog width={columns} height={rows} />
        </Box>
      ) : (
        <Box flexGrow={1} minHeight={0} flexDirection="column">
          {route.type === 'home' ? (
            <HomeView />
          ) : (
            <SessionView columns={columns} rows={rows} initialPrompt={route.type === 'session' ? route.initialPrompt : undefined} />
          )}
        </Box>
      )}
    </Box>
  );
}
