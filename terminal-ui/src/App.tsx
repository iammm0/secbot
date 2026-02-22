import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useChat } from './useChat.js';
import { MainContent } from './MainContent.js';
import { parseSlash, getAgentFromState } from './slash.js';
import { useExit, useCommand, useToast, useRoute } from './contexts/index.js';
import { useDialog } from './contexts/DialogContext.js';
import { useTheme } from './contexts/ThemeContext.js';
import { api } from './api.js';
import { tuiEvents } from './events.js';
import { Toast } from './components/Toast.js';
import { Dialog } from './components/Dialog.js';
import { CommandPanel } from './components/CommandPanel.js';
import { HomeView } from './views/HomeView.js';
import type { ChatMode } from './types.js';

interface AppProps {
  columns?: number;
  rows?: number;
}

export function App({ columns = 80, rows = 24 }: AppProps) {
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<ChatMode>('agent');
  const [agent, setAgent] = useState('hackbot');
  const theme = useTheme();
  const exit = useExit();
  const dialog = useDialog();
  const { register, trigger } = useCommand();
  const toast = useToast();
  const { route } = useRoute();
  const {
    streaming,
    streamState,
    apiOutput,
    sendMessage,
    setRESTOutput,
  } = useChat();

  useEffect(() => {
    const unsubToast = tuiEvents.on('tui.toast.show', (opts: { message: string; title?: string; variant?: string }) => {
      toast.show({ message: opts.message, title: opts.title, variant: opts.variant as 'success' | 'error' | 'warning' | 'info' });
    });
    const unsubCmd = tuiEvents.on('tui.command.execute', (command: string) => trigger(command));
    return () => { unsubToast(); unsubCmd(); };
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
  }, [register, agent, sendMessage, setRESTOutput]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit(0);
      return;
    }
    if (key.escape) {
      dialog.clear();
    }
    if (key.ctrl && input === 'k') {
      dialog.replace(<CommandPanel />, () => dialog.clear());
    }
  });

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('/')) {
        const result = parseSlash(trimmed, { mode, agent });
        if (result.handled) {
            setAgent(getAgentFromState(trimmed, agent));
            if (result.chat && result.chat.message) {
              setMode(result.chat.mode);
              sendMessage(result.chat.message, result.chat.mode, result.chat.agent);
              setInputValue('');
              return;
            }
            if (result.chat && !result.chat.message) {
              setMode(result.chat.mode);
              setInputValue('');
              return;
            }
          if (result.fetchThen) {
            setRESTOutput('加载中…');
            result
              .fetchThen()
              .then(setRESTOutput)
              .catch((err) => setRESTOutput(`错误: ${err.message}`));
            setInputValue('');
            return;
          }
          setInputValue('');
          return;
        }
      }

      sendMessage(trimmed, mode, agent);
      setInputValue('');
    },
    [mode, agent, sendMessage, setRESTOutput]
  );

  return (
    <Box flexDirection="column" width={columns} height={rows} padding={1} borderStyle="round" borderColor={theme.borderActive}>
      <Toast />
      <Dialog width={columns} height={rows} />
      {route.type === 'home' ? (
        <HomeView />
      ) : (
        <>
          <Box flexDirection="row" flexGrow={1} minHeight={8}>
            <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={theme.border}>
              <MainContent
                streamState={streamState}
                streaming={streaming}
                apiOutput={apiOutput}
              />
            </Box>
            <Box width={22} paddingX={1} borderStyle="single" borderColor={theme.border} flexDirection="column">
              <Text color={theme.primary} bold>
                Sessions
              </Text>
              <Text color={theme.textMuted}>当前会话</Text>
              <Text color={theme.textMuted}>mode: {mode}</Text>
              <Text color={theme.textMuted}>agent: {agent}</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.success}>{'> '}</Text>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              placeholder="消息或 /plan, /start, /ask, /list-tools..."
            />
          </Box>
        </>
      )}
    </Box>
  );
}
