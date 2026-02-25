/**
 * 安全块 — 漏洞/扫描结果等安全相关展示
 */
import React from 'react';
import { BlockCommon } from './BlockCommon.js';
import { useTheme } from '../../contexts/ThemeContext.js';

interface SecurityBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function SecurityBlock({ title = '安全', body, noMargin }: SecurityBlockProps) {
  const theme = useTheme();
  return (
    <BlockCommon
      title={title}
      titleColor={theme.warning}
      body={body}
      bodyColor={theme.text}
      noMargin={noMargin}
      accentBar
      accentColor={theme.warning}
    />
  );
}
