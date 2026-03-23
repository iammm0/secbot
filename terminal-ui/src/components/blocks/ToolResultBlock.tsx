/**
 * 工具结果块 — 工具执行结果专用展示
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface ToolResultBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

export function ToolResultBlock({ title = '工具结果', body, noMargin, isPlaceholder }: ToolResultBlockProps) {
  const theme = useTheme();
  return (
    <BlockCommon
      title={`${title}（原始）`}
      titleColor={theme.textMuted}
      body={body}
      bodyColor={isPlaceholder ? theme.textMuted : theme.text}
      noMargin={noMargin}
      accentBar={false}
      accentColor={theme.textMuted}
    />
  );
}
