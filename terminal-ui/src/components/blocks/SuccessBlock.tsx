/**
 * 成功块 — 成功消息展示
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface SuccessBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function SuccessBlock({ title = '成功', body, noMargin }: SuccessBlockProps) {
  const theme = useTheme();
  return (
    <BlockCommon
      title={title}
      titleColor={theme.success}
      body={body}
      bodyColor={theme.text}
      noMargin={noMargin}
      accentBar
      accentColor={theme.success}
    />
  );
}
