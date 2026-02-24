/**
 * 推理块 — 单步推理内容（ReAct Thought）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface ThoughtBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function ThoughtBlock({ title, body, noMargin }: ThoughtBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || ' ');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2} paddingLeft={1}>
      {title ? (
        <Text color={theme.accent} dimColor>
          {title}
        </Text>
      ) : null}
      <Text dimColor color={theme.textMuted}>
        {rendered}
      </Text>
    </Box>
  );
}
