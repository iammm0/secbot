/**
 * 代码块 — 代码片段，固定宽度字体感、边框
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface CodeBlockProps {
  title?: string;
  /** 代码内容（不解析 Markdown） */
  body: string;
  noMargin?: boolean;
  /** 语言标签，如 "bash" / "json" */
  language?: string;
}

export function CodeBlock({ title, body, noMargin, language }: CodeBlockProps) {
  const theme = useTheme();
  const lines = (body || ' ').trim().split('\n');
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title || language ? (
        <Text color={theme.textMuted} dimColor>
          {[title, language].filter(Boolean).join(' — ')}
        </Text>
      ) : null}
      <Box flexDirection="column" paddingLeft={1} borderStyle="single" borderColor={theme.border}>
        {lines.map((line, i) => (
          <Text key={i} color={theme.text}>
            {line || ' '}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
