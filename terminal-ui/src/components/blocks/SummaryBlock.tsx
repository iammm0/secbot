/**
 * 摘要块 — 单行或短摘要
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface SummaryBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  /** 是否加粗 */
  bold?: boolean;
}

export function SummaryBlock({ title, body, noMargin, bold }: SummaryBlockProps) {
  const theme = useTheme();
  const line = body.trim().split('\n')[0] || ' ';
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? (
        <Text color={theme.textMuted}>{title}: </Text>
      ) : null}
      <Text color={theme.text} bold={bold}>
        {line}
      </Text>
    </Box>
  );
}
