/**
 * 有序列表块
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface NumberedBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function NumberedBlock({ title, body, noMargin }: NumberedBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || ' ');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.textMuted}>{title}</Text> : null}
      <Text color={theme.text}>{rendered}</Text>
    </Box>
  );
}
