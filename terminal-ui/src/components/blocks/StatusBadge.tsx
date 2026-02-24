/**
 * 状态徽标 — ✓ / ✗ / … 等，统一样式
 */
import React from 'react';
import { Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

export type BadgeStatus = 'success' | 'error' | 'pending' | 'warning';

const SYMBOLS: Record<BadgeStatus, string> = {
  success: '✓',
  error: '✗',
  pending: '…',
  warning: '!',
};

interface StatusBadgeProps {
  status: BadgeStatus;
  /** 可选文字，如 "完成" / "失败" */
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const theme = useTheme();
  const color =
    status === 'success'
      ? theme.success
      : status === 'error'
        ? theme.error
        : status === 'warning'
          ? theme.warning
          : theme.textMuted;
  const sym = SYMBOLS[status];
  return (
    <Text color={color}>
      {sym}
      {label ? ` ${label}` : ''}
    </Text>
  );
}
