/**
 * 键值对块 — 标签-值展示，值支持 Markdown（## 标题、** 强调）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface KeyValueBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function KeyValueBlock({ title, body, noMargin }: KeyValueBlockProps) {
  const theme = useTheme();
  const lines = (body || '').split('\n').filter(Boolean);
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? <Text color={theme.textMuted}>{title}</Text> : null}
      {lines.map((line, i) => {
        const colon = line.indexOf(':');
        if (colon > 0) {
          const k = line.slice(0, colon).trim();
          const v = line.slice(colon + 1).trim();
          const needsMd = /##|\*\*/.test(v);
          return (
            <Box key={i} flexDirection="row">
              <Text color={theme.primary}>{k}: </Text>
              <Text color={theme.text}>{needsMd ? renderMarkdown(v) : v}</Text>
            </Box>
          );
        }
        return <Text key={i} color={theme.text}>{/##|\*\*/.test(line) ? renderMarkdown(line) : line}</Text>;
      })}
    </Box>
  );
}
