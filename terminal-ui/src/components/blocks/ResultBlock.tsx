/**
 * 内容块 — 工具执行结果 / 正文内容（可折叠）
 *
 * 重构说明（Layer 5 - 内容/结果）：
 *  - 标题行：`┌ 标题`（border/gray）
 *  - 正文：每行前缀 `│ `（border/gray）+ 内容（theme.text white）
 *  - isPlaceholder 时退化为普通样式（无边框，textMuted）
 *  - 使用 renderMarkdown 保留富文本格式
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../renderMarkdown.js";

interface ResultBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  /** 是否为折叠占位（仅显示一行提示） */
  isPlaceholder?: boolean;
}

export function ResultBlock({
  title = "内容",
  body,
  noMargin,
  isPlaceholder,
}: ResultBlockProps) {
  const theme = useTheme();

  // isPlaceholder：退化为普通 dim 样式，无边框装饰
  if (isPlaceholder) {
    return (
      <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
        <Text color={theme.textMuted} dimColor>
          {title}
        </Text>
        <Text color={theme.textMuted} dimColor>
          {body || " "}
        </Text>
      </Box>
    );
  }

  // 正常内容：renderMarkdown 后按行拆分，每行加 │ 前缀
  const rendered = renderMarkdown(body || " ");
  const lines = rendered.split("\n");

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* 标题行：┌ 标题 — border/gray */}
      <Text color={theme.border}>
        {"┌ "}
        {title}
      </Text>

      {/* 正文：每行 │ 前缀（border/gray）+ 内容（theme.text） */}
      {lines.map((line, i) => (
        <Box key={i} flexDirection="row">
          <Text color={theme.border}>{"│ "}</Text>
          <Text color={theme.text}>{line || " "}</Text>
        </Box>
      ))}
    </Box>
  );
}
