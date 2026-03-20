/**
 * 块通用：标题 + 正文区，供各具体块复用
 *
 * 重构说明（通用基础组件）：
 *  - 支持两种模式：
 *    1. accentBar=true：`│ ` 前缀 + title + body（用于 ApiBlock、ReportBlock 等）
 *    2. accentBar=false：title + body（普通无边块）
 *  - marginBottom 统一改为 1，减少垂直空间占用
 *  - 其余逻辑不变，供非重构块（ApiBlock、ReportBlock 等）继续使用
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../renderMarkdown.js";

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
  const rendered = renderMarkdown(body || " ");
  const tc = titleColor ?? theme.textMuted;
  const bc = bodyColor ?? theme.text;
  const bar = accentColor ?? theme.primary;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* accentBar 模式：左侧 │ 竖线前缀，title + body 整体缩进 */}
      {accentBar && (
        <Box flexDirection="row">
          <Text color={bar}>{"│ "}</Text>
          <Box flexDirection="column" flexGrow={1}>
            {title ? <Text color={tc}>{title}</Text> : null}
            <Text color={bc}>{rendered}</Text>
          </Box>
        </Box>
      )}

      {/* 无前缀模式：title 独占一行，body 紧随其后 */}
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
