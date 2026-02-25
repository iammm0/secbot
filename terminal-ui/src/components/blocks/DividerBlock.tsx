/**
 * 分隔块 — 视觉分隔线
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface DividerBlockProps {
  body?: string;
  noMargin?: boolean;
}

export function DividerBlock({ body, noMargin }: DividerBlockProps) {
  const theme = useTheme();
  const line = body?.trim() || '─'.repeat(40);
  return (
    <Box flexDirection="row" marginBottom={noMargin ? 0 : 1}>
      <Text color={theme.border}>{line}</Text>
    </Box>
  );
}
