/**
 * API 输出块 — REST/斜杠命令的返回内容
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface ApiBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function ApiBlock({ title = 'API', body, noMargin }: ApiBlockProps) {
  const theme = useTheme();
  return (
    <BlockCommon
      title={title}
      titleColor={theme.info}
      body={body}
      bodyColor={theme.textMuted}
      noMargin={noMargin}
      accentBar
      accentColor={theme.info}
    />
  );
}
