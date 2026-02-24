/**
 * 错误块 — 错误信息，醒目红色
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface ErrorBlockProps {
  body: string;
  noMargin?: boolean;
}

export function ErrorBlock({ body, noMargin }: ErrorBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || ' ');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      <Text color={theme.error} bold>
        错误
      </Text>
      <Text color={theme.error}>{rendered}</Text>
    </Box>
  );
}
