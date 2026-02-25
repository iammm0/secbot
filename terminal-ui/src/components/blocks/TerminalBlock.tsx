/**
 * 终端块 — 终端输出样式（等宽、暗色）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface TerminalBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function TerminalBlock({ title = '终端', body, noMargin }: TerminalBlockProps) {
  const theme = useTheme();
  const lines = (body || '').split('\n');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.textMuted}>{title}</Text> : null}
      <Box flexDirection="column" paddingLeft={1} borderStyle="single" borderColor={theme.border}>
        {lines.map((line, i) => (
          <Text key={i} color={theme.text}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
}
