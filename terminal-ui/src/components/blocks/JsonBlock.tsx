/**
 * JSON 块 — 格式化展示 JSON 数据
 */
import React from 'react';
import { Box, Text } from 'ink';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface JsonBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

function tryFormatJson(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

export function JsonBlock({ title = 'JSON', body, noMargin }: JsonBlockProps) {
  const theme = useTheme();
  const formatted = tryFormatJson(body);
  return (
    <BlockCommon
      title={title}
      titleColor={theme.accent}
      body={formatted}
      bodyColor={theme.text}
      noMargin={noMargin}
      accentBar
      accentColor={theme.accent}
    />
  );
}
