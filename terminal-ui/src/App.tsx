import React, { useState, useEffect } from 'react';
import { Box, useInput } from 'ink';
import fs from 'node:fs/promises';
import path from 'node:path';
import { useCommand, useToast, useRoute, useSync, useLocal, useKeybind } from './contexts/index.js';
import { inkKeyToParsedKey, isInkEscape } from './contexts/KeybindContext.js';
import { useDialog } from './contexts/DialogContext.js';
import { api } from './api.js';
import { tuiEvents } from './events.js';
import { Toast } from './components/Toast.js';
import { Dialog } from './components/Dialog.js';
import { CommandPanel } from './components/CommandPanel.js';
import { ModelConfigDialog } from './components/ModelConfigDialog.js';
import { LogLevelDialog } from './components/LogLevelDialog.js';
import { RestResultDialog } from './components/RestResultDialog.js';
import { AgentSelectDialog } from './components/AgentSelectDialog.js';
import { SessionSelectDialog } from './components/SessionSelectDialog.js';
import { ToolsDialog } from './components/ToolsDialog.js';
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
  const { sendMessage, setRESTOutput, newSession, switchSession, sessionList } = sync;
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
      register({ title: 'Ask 模式', value: '/ask', category: '会话', slash: '/ask', onSelect: ({ close }) => { setMode('ask'); toast.show({ message: '已切换到问答模式', variant: 'success' }); close(); } }),
      register({ title: '任务模式', value: '/task', category: '会话', slash: '/task', onSelect: ({ close }) => { setMode('agent'); toast.show({ message: '已切换到任务模式', variant: 'success' }); close(); } }),
      register({ title: '切换智能体', value: '/agent', category: '会话', slash: '/agent', onSelect: ({ close }) => { close(); dialog.replace(<AgentSelectDialog />); } }),
      register({
        title: '新建空白会话',
        value: '/new-session',
        category: '会话',
        slash: '/new-session',
        onSelect: ({ close }) => {
          newSession();
          toast.show({ message: '已新建空白会话', variant: 'success' });
          close();
        },
      }),
      register({
        title: '切换会话',
        value: '/sessions',
        category: '会话',
        slash: '/sessions',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <SessionSelectDialog
              sessions={sessionList}
              onSelect={(id) => switchSession(id)}
            />,
          );
        },
      }),
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
        title: '列出智能体（详情）',
        value: '/list-agents',
        category: 'REST',
        slash: '/list-agents',
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <RestResultDialog
              title="智能体列表"
              fetchContent={() =>
                api.get<{ agents: Array<{ type: string; name: string; description: string }> }>('/api/agents').then((r) =>
                  (r.agents ?? []).map((a) => `${a.type}: ${a.name} — ${a.description}`).join('\n')
                )
              }
            />
          );
        },
      }),
      register({
        title: '模型配置向导（/model）',
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
        title: '内置工具（分类浏览）',
        value: '/tools',
        category: 'REST',
        slash: '/tools',
        onSelect: ({ close }) => {
          close();
          dialog.replace(<ToolsDialog />);
        },
      }),
    ];
    return () => { unregs.forEach((u) => u()); };
  }, [register, setRESTOutput, setMode, dialog, toast, newSession, switchSession, sessionList]);

  useInput((input, key) => {
    const evt = inkKeyToParsedKey(input, key);
    const hasOpenDialog = dialog.stack.length > 0;
    // 有弹窗时在本层统一关顶层（避免子组件 useInput 在部分终端/重渲染下未收到 Esc）
    if (hasOpenDialog && isInkEscape(input, key)) {
      dialog.pop();
      return;
    }
    if (keybind.match('exit', evt)) {
      if (hasOpenDialog) {
        dialog.clear();
        return;
      }
    }
    // 已有弹窗时不要打开命令面板，否则会 replace 掉当前弹窗（如 /model），表现为「闪退」
    if (!hasOpenDialog && keybind.match('command_list', evt)) {
      dialog.replace(<CommandPanel />, () => dialog.clear());
      return;
    }
    if (!hasOpenDialog && keybind.match('agent_switch', evt)) {
      trigger('/agent');
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
