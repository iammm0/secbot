/**
 * 规划块 — 规划内容与 Todo 列表（有 todos 时用 TodoList 渲染）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';
import { TodoList } from './TodoList.js';
import type { ContentBlock } from '../../types.js';

interface PlanningBlockProps {
  block: ContentBlock;
  noMargin?: boolean;
}

export function PlanningBlock({ block, noMargin }: PlanningBlockProps) {
  const theme = useTheme();
  const title = block.title ?? '规划';
  const body = block.body || ' ';
  const hasTodos = block.todos && block.todos.length > 0;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2} paddingLeft={1}>
      <Text color={theme.secondary} bold>
        {title}
      </Text>
      {hasTodos ? (
        <TodoList items={block.todos!} noMargin title={undefined} />
      ) : (
        <Text dimColor color={body === '规划中…' ? theme.textMuted : theme.text}>
          {body === '规划中…' ? '规划中…' : renderMarkdown(body)}
        </Text>
      )}
    </Box>
  );
}
