/**
 * 块通用：标题 + 正文区，供各具体块复用
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';

interface BlockCommonProps {
  title?: string;
  titleColor?: string;
  body: string;
  bodyColor?: string;
  noMargin?: boolean;
  /** 左侧竖线前缀（用于区分区块） */
  accentBar?: boolean;
  accentColor?: string;
}

export function BlockCommon({
  title,
  titleColor,
  body,
  bodyColor,
  noMargin,
  accentBar = false,
  accentColor,
}: BlockCommonProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || ' ');
  const tc = titleColor ?? theme.textMuted;
  const bc = bodyColor ?? theme.text;
  const bar = accentColor ?? theme.primary;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      {accentBar && (
        <Box flexDirection="row">
          <Text color={bar}>│ </Text>
          <Box flexDirection="column" flexGrow={1}>
            {title ? <Text color={tc}>{title}</Text> : null}
            <Text color={bc}>{rendered}</Text>
          </Box>
        </Box>
      )}
      {!accentBar && (
        <>
          {title ? (
            <Box marginBottom={0}>
              <Text color={tc}>{title}</Text>
            </Box>
          ) : null}
          <Text color={bc}>{rendered}</Text>
        </>
      )}
    </Box>
  );
}
