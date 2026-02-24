/**
 * 标签: 值 — 键值对单行展示
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface LabelValueProps {
  label: string;
  value: string | number | boolean;
  /** 标签宽度（对齐多组时用） */
  labelWidth?: number;
  valueColor?: string;
}

export function LabelValue({ label, value, labelWidth, valueColor }: LabelValueProps) {
  const theme = useTheme();
  const padded = labelWidth ? label.padEnd(labelWidth) : label;
  const valStr = String(value);
  return (
    <Box flexDirection="row">
      <Text color={theme.textMuted}>{padded}: </Text>
      <Text color={valueColor ?? theme.text}>{valStr}</Text>
    </Box>
  );
}
