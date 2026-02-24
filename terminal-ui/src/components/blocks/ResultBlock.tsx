/**
 * 内容块 — 工具执行结果 / 正文内容（可折叠）
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface ResultBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  /** 是否为折叠占位（仅显示一行提示） */
  isPlaceholder?: boolean;
}

export function ResultBlock({ title = '内容', body, noMargin, isPlaceholder }: ResultBlockProps) {
  const theme = useTheme();
  return (
    <BlockCommon
      title={title}
      titleColor={theme.text}
      body={body}
      bodyColor={isPlaceholder ? theme.textMuted : theme.text}
      noMargin={noMargin}
      accentBar={!isPlaceholder}
      accentColor={theme.border}
    />
  );
}
