import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';
import { useRoute } from '../contexts/RouteContext.js';

export function HomeView() {
  const theme = useTheme();
  const { navigate } = useRoute();
  return (
    <Box flexDirection="column" padding={2} justifyContent="center" alignItems="center">
      <Text bold color={theme.primary}>Secbot</Text>
      <Text color={theme.textMuted}>按 Ctrl+K 打开命令面板 · 输入 /plan、/start、/ask 等</Text>
      <Text color={theme.textMuted} dimColor>按 Enter 进入会话</Text>
    </Box>
  );
}
