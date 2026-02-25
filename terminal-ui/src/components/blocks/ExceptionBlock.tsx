/**
 * 异常块 — 异常堆栈展示
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface ExceptionBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function ExceptionBlock({ title = '异常', body, noMargin }: ExceptionBlockProps) {
  const theme = useTheme();
  const lines = (body || '').split('\n');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.error}>{title}</Text> : null}
      {lines.map((line, i) => (
        <Text key={i} color={i === 0 ? theme.error : theme.textMuted}>{line}</Text>
      ))}
    </Box>
  );
}
