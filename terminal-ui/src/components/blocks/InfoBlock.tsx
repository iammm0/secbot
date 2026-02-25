/**
 * 信息块 — 通用信息展示
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface InfoBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function InfoBlock({ title = '信息', body, noMargin }: InfoBlockProps) {
  const theme = useTheme();
  return (
    <BlockCommon
      title={title}
      titleColor={theme.info}
      body={body}
      bodyColor={theme.text}
      noMargin={noMargin}
      accentBar
      accentColor={theme.info}
    />
  );
}
