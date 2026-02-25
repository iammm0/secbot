/**
 * 建议块 — 提示/建议类消息
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface SuggestionBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function SuggestionBlock({ title = '建议', body, noMargin }: SuggestionBlockProps) {
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
