import React, { useState, useEffect } from 'react';
import { Box, useInput } from 'ink';
import { useExit, useCommand, useToast, useRoute, useSync, useLocal, useKeybind } from './contexts/index.js';
import { inkKeyToParsedKey } from './contexts/KeybindContext.js';
import { useDialog } from './contexts/DialogContext.js';
import { api } from './api.js';
import { tuiEvents } from './events.js';
import { Toast } from './components/Toast.js';
import { Dialog } from './components/Dialog.js';
import { CommandPanel } from './components/CommandPanel.js';
import { HomeView } from './views/HomeView.js';
import { SessionView } from './views/SessionView.js';

interface AppProps {
  columns?: number;
  rows?: number;
}

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

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
    const stream = stdout as NodeJS.WriteStream & { on?(e: 'resize', fn: () => void): void; off?(e: 'resize', fn: () => void): void; columns?: number; rows?: number };
    if (!stream?.on) return;
    const onResize = () => setDimensions({
      columns: (stream.columns ?? DEFAULT_COLUMNS),
      rows: (stream.rows ?? DEFAULT_ROWS),
    });
    stream.on('resize', onResize);
    return () => { stream.off?.('resize', onResize); };
  }, [stdout]);

  const { columns, rows } = dimensions;
  const exit = useExit();
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
      register({ title: '计划模式', value: '/plan', category: '会话', slash: '/plan', onSelect: ({ close }) => { setMode('plan'); close(); } }),
      register({ title: '开始执行', value: '/start', category: '会话', slash: '/start', onSelect: ({ close }) => { setMode('agent'); sendMessage('执行既定安全测试计划', 'agent', agent); close(); } }),
      register({ title: 'Ask 模式', value: '/ask', category: '会话', slash: '/ask', onSelect: ({ close }) => { setMode('ask'); close(); } }),
      register({
        title: '列出智能体',
        value: '/list-tools',
        category: 'CLI',
        slash: '/list-tools',
        onSelect: ({ close }) => {
          setRESTOutput('加载中…');
          api.get<{ agents: Array<{ type: string; name: string }> }>('/api/agents').then((r) => setRESTOutput((r.agents ?? []).map((a) => `${a.type}: ${a.name}`).join('\n'))).catch((e) => setRESTOutput(String((e as Error).message)));
          close();
        },
      }),
    ];
    return () => { unregs.forEach((u) => u()); };
  }, [register, agent, sendMessage, setRESTOutput, setMode]);

  useInput((input, key) => {
    const evt = inkKeyToParsedKey(input, key);
    if (keybind.match('exit', evt)) {
      exit(0);
      return;
    }
    if (keybind.match('escape', evt)) {
      dialog.pop();
      return;
    }
    if (keybind.match('command_list', evt)) {
      dialog.replace(<CommandPanel />, () => dialog.clear());
      return;
    }
  });

  return (
    <Box flexDirection="column" width={columns} height={rows} padding={1}>
      <Toast />
      <Dialog width={columns} height={rows} />
      <Box flexGrow={1} minHeight={0} flexDirection="column">
        {route.type === 'home' ? (
          <HomeView />
        ) : (
          <SessionView columns={columns} rows={rows} initialPrompt={route.type === 'session' ? route.initialPrompt : undefined} />
        )}
      </Box>
    </Box>
  );
}
