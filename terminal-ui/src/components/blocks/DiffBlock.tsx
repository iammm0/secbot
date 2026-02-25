/**
 * Diff 块 — 代码差异展示（+ 绿 / - 红）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface DiffBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function DiffBlock({ title = 'Diff', body, noMargin }: DiffBlockProps) {
  const theme = useTheme();
  const lines = (body || '').split('\n');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.textMuted}>{title}</Text> : null}
      {lines.map((line, i) => {
        if (line.startsWith('+')) return <Text key={i} color={theme.success}>{line}</Text>;
        if (line.startsWith('-')) return <Text key={i} color={theme.error}>{line}</Text>;
        return <Text key={i} color={theme.text}>{line}</Text>;
      })}
    </Box>
  );
}
