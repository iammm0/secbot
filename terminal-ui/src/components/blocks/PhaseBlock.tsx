/**
 * 阶段块 — 流式时的当前阶段（phase + detail）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface PhaseBlockProps {
  body: string;
  noMargin?: boolean;
}

export function PhaseBlock({ body, noMargin }: PhaseBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || ' ');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2} paddingLeft={1}>
      <Text dimColor color={theme.textMuted}>
        {rendered}
      </Text>
    </Box>
  );
}
