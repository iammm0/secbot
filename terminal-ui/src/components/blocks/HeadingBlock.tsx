/**
 * 标题块 — 标题样式
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface HeadingBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function HeadingBlock({ title, body, noMargin }: HeadingBlockProps) {
  const theme = useTheme();
  const text = (body || title || '').replace(/^#+\s*/, '').trim();
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      <Text bold color={theme.primary}>{text}</Text>
    </Box>
  );
}
