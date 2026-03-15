/**
 * 用户消息块 — 在上下文中展示用户发送的内容，与助手回复区分
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface UserMessageBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function UserMessageBlock({ title = '用户', body, noMargin }: UserMessageBlockProps) {
  const theme = useTheme();
  const lines = (body || ' ').trim().split('\n');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1} paddingLeft={1} borderStyle="single" borderColor={theme.border}>
      <Text color={theme.primary} bold>{title}</Text>
      {lines.map((line, i) => (
        <Text key={i} color={theme.text}>{line || ' '}</Text>
      ))}
    </Box>
  );
}
