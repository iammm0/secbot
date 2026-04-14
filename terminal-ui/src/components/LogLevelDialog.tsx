import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { api } from '../api.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { useDialog } from '../contexts/DialogContext.js';
import { isInkEscape } from '../contexts/KeybindContext.js';

type LogLevel = 'DEBUG' | 'INFO';

export function LogLevelDialog() {
  const theme = useTheme();
  const { pop } = useDialog();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LogLevel>('INFO');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    api.get<{ level: string }>('/api/system/log-level')
      .then((res) => {
        setSelected((res.level || 'INFO').toUpperCase() === 'DEBUG' ? 'DEBUG' : 'INFO');
      })
      .catch((e) => {
        setMessage(String((e as Error).message));
      })
      .finally(() => setLoading(false));
  }, []);

  useInput((input, key) => {
    if (isInkEscape(input, key)) {
      pop();
      return;
    }
    if (loading) return;
    if (key.upArrow || key.downArrow) {
      setSelected((prev) => (prev === 'INFO' ? 'DEBUG' : 'INFO'));
      return;
    }
    if (key.return) {
      api.post<{ success: boolean; message: string }>('/api/system/log-level', { level: selected })
        .then((res) => setMessage(res.message))
        .catch((e) => setMessage(String((e as Error).message)));
      return;
    }
    if (input.toLowerCase() === 'd') {
      setSelected('DEBUG');
      return;
    }
    if (input.toLowerCase() === 'i') {
      setSelected('INFO');
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
      <Text bold color={theme.primary}>日志级别设置</Text>
      <Text color={theme.textMuted}>↑↓ 选择 · Enter 应用并持久化 · Esc 关闭</Text>
      {loading ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>加载中…</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={selected === 'INFO' ? theme.primary : theme.text}>{selected === 'INFO' ? '> ' : '  '}INFO</Text>
          <Text color={selected === 'DEBUG' ? theme.primary : theme.text}>{selected === 'DEBUG' ? '> ' : '  '}DEBUG</Text>
        </Box>
      )}
      {message ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>{message}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
