/**
 * 引用块 — 引用样式展示
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface QuoteBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function QuoteBlock({ title, body, noMargin }: QuoteBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || ' ');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.textMuted}>{title}</Text> : null}
      <Box flexDirection="row">
        <Text color={theme.border}>│ </Text>
        <Text color={theme.textMuted}>{rendered}</Text>
      </Box>
    </Box>
  );
}
