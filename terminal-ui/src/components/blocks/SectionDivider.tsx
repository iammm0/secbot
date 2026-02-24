/**
 * 区块分隔线 — 视觉分隔不同部分
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface SectionDividerProps {
  /** 可选中间文字，如 "——— 下一阶段 ———" */
  label?: string;
  /** 分隔线长度（字符数），默认根据终端宽度或 20 */
  width?: number;
  noMargin?: boolean;
}

export function SectionDivider({ label, width = 24, noMargin }: SectionDividerProps) {
  const theme = useTheme();
  const line = '─'.repeat(Math.max(0, width));
  return (
    <Box flexDirection="row" marginBottom={noMargin ? 0 : 1}>
      {label ? (
        <Text color={theme.textMuted}>
          {line} {label} {line}
        </Text>
      ) : (
        <Text color={theme.border}>{line}</Text>
      )}
    </Box>
  );
}
