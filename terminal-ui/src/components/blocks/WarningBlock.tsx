/**
 * 警告块 — 非致命提示信息
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface WarningBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function WarningBlock({ title = '注意', body, noMargin }: WarningBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || ' ');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      <Text color={theme.warning} bold>
        {title}
      </Text>
      <Text color={theme.warning}>{rendered}</Text>
    </Box>
  );
}
