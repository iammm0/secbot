/**
 * 终端块 — 终端输出样式（等宽、暗色）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface TerminalBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

export function TerminalBlock({ title = '终端', body, noMargin, isPlaceholder }: TerminalBlockProps) {
  const theme = useTheme();
  if (isPlaceholder) {
    return (
      <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
        <Text color={theme.textMuted} dimColor>
          {"▸ "}
          {title}
        </Text>
        <Box paddingLeft={3}>
          <Text color={theme.textMuted} dimColor>
            {body || ' '}
          </Text>
        </Box>
      </Box>
    );
  }
  const rendered = renderMarkdown(body || ' ');
  const lines = rendered.split('\n');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.textMuted}>{title}</Text> : null}
      <Box flexDirection="column" paddingLeft={1} borderStyle="single" borderColor={theme.border}>
        {lines.map((line, i) => (
          <Text key={i} color={theme.text}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
}
