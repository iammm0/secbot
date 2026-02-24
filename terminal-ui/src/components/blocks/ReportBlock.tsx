/**
 * 报告块 — 安全/扫描报告等
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface ReportBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

export function ReportBlock({ title = '报告', body, noMargin, isPlaceholder }: ReportBlockProps) {
  const theme = useTheme();
  return (
    <BlockCommon
      title={title}
      titleColor={theme.warning}
      body={body}
      bodyColor={isPlaceholder ? theme.textMuted : theme.text}
      noMargin={noMargin}
      accentBar={!isPlaceholder}
      accentColor={theme.warning}
    />
  );
}
