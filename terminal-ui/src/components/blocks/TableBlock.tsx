/**
 * 表格块 — 简单表格展示（Markdown 表格或键值对）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface TableBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function TableBlock({ title, body, noMargin }: TableBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || ' ');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.textMuted}>{title}</Text> : null}
      <Text color={theme.text}>{rendered}</Text>
    </Box>
  );
}
