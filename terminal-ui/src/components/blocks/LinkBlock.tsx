/**
 * 链接块 — 链接展示
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface LinkBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function LinkBlock({ title, body, noMargin }: LinkBlockProps) {
  const theme = useTheme();
  const url = (body || '').trim();
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.textMuted}>{title}</Text> : null}
      <Text color={theme.primary} underline>{url}</Text>
    </Box>
  );
}
