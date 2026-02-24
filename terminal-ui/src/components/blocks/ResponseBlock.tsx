/**
 * 回复块 — 最终回复/总结
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface ResponseBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

export function ResponseBlock({ title = '回复', body, noMargin, isPlaceholder }: ResponseBlockProps) {
  const theme = useTheme();
  return (
    <BlockCommon
      title={title}
      titleColor={theme.success}
      body={body}
      bodyColor={isPlaceholder ? theme.textMuted : theme.text}
      noMargin={noMargin}
      accentBar={!isPlaceholder}
      accentColor={theme.success}
    />
  );
}
