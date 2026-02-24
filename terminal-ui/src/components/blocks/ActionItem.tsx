/**
 * 单条工具执行 — 工具名 + 状态 + 可选错误
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { StatusBadge, type BadgeStatus } from './StatusBadge.js';

interface ActionItemProps {
  tool: string;
  success?: boolean;
  done?: boolean;
  error?: string;
}

export function ActionItem({ tool, success, done, error }: ActionItemProps) {
  const theme = useTheme();
  const status: BadgeStatus = !done ? 'pending' : success ? 'success' : 'error';
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <StatusBadge status={status} />
        <Text color={theme.text}> </Text>
        <Text color={theme.primary} bold>
          {tool}
        </Text>
      </Box>
      {error ? (
        <Box paddingLeft={2}>
          <Text color={theme.error}>{error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
