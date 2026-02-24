/**
 * Todo 列表 — 规划中的待办项，带状态
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { StatusBadge, type BadgeStatus } from './StatusBadge.js';
import type { TodoItemData } from '../../types.js';

interface TodoListProps {
  items: TodoItemData[];
  noMargin?: boolean;
  title?: string;
}

function statusToBadge(s?: string): BadgeStatus {
  if (!s) return 'pending';
  const lower = s.toLowerCase();
  if (lower === 'done' || lower === 'completed' || lower === '完成') return 'success';
  if (lower === 'failed' || lower === '失败') return 'error';
  if (lower === 'pending' || lower === '进行中') return 'pending';
  return 'pending';
}

export function TodoList({ items, noMargin, title }: TodoListProps) {
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {title ? (
        <Text color={theme.secondary} bold>
          {title}
        </Text>
      ) : null}
      {items.map((item, i) => (
        <Box key={i} flexDirection="row">
          <Box width={3}>
            <StatusBadge status={statusToBadge(item.status)} />
          </Box>
          <Text color={theme.text}>{item.content}</Text>
        </Box>
      ))}
    </Box>
  );
}
