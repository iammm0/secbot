/**
 * 错误块 — 错误信息，醒目红色
 *
 * 重构说明（Layer - 错误）：
 *  - 标题行：`✗ 错误`（error/red，bold）
 *  - 正文：paddingLeft={2} 缩进，red 色
 *  - 去掉 renderMarkdown（错误通常是纯文本，无需 markdown 渲染）
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

interface ErrorBlockProps {
  body: string;
  noMargin?: boolean;
}

export function ErrorBlock({ body, noMargin }: ErrorBlockProps) {
  const theme = useTheme();
  const lines = (body || " ").split("\n");

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* 标题行：✗ 错误 — error/red，bold */}
      <Text color={theme.error} bold>
        {"✗ 错误"}
      </Text>

      {/* 正文：paddingLeft={2} 缩进，red 色 */}
      <Box paddingLeft={2} flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i} color={theme.error}>
            {line || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
