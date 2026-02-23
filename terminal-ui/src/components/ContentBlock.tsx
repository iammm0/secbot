/**
 * 单块内容：按推理与执行链路分模块展示，无边框、无底部 agent 标识
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';
import type { ContentBlock as ContentBlockType } from '../types.js';
import { renderMarkdown } from '../renderMarkdown.js';

const THINKING_TYPES = ['planning', 'thought', 'phase'] as const;

interface ContentBlockProps {
  block: ContentBlockType;
  /** 在滚动区内使用时为 true，不增加块间距，由外层控制高度 */
  noMargin?: boolean;
}

export function ContentBlock({ block, noMargin }: ContentBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(block.body || ' ');
  const isThinking = THINKING_TYPES.includes(block.type as (typeof THINKING_TYPES)[number]);

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {isThinking ? (
        <Box paddingLeft={1} paddingRight={1} paddingTop={0} paddingBottom={0} flexDirection="column">
          {block.title ? (
            <Text dimColor color={theme.textMuted}>
              {block.title}
            </Text>
          ) : null}
          <Text dimColor>{rendered}</Text>
        </Box>
      ) : (
        <>
          {block.title && block.type !== 'error' ? (
            <Box marginBottom={0}>
              <Text color={theme.text}>
                {block.title}
              </Text>
            </Box>
          ) : null}
          {block.type === 'error' ? (
            <Text color={theme.error}>{rendered}</Text>
          ) : (
            <Text color={theme.text}>{rendered}</Text>
          )}
        </>
      )}
    </Box>
  );
}
