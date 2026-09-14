/**
 * 报告块 — 安全报告全文走 Markdown（表格 / 代码 / 标题）
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../renderMarkdown.js";

interface ReportBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

export function ReportBlock({
  title = "安全报告",
  body,
  noMargin,
  isPlaceholder,
}: ReportBlockProps) {
  const theme = useTheme();
  const rendered = isPlaceholder ? body || " " : renderMarkdown(body || " ");
  const lines = rendered.split("\n");

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {title ? (
        <Text color={theme.accent} bold>
          {title}
        </Text>
      ) : null}
      {lines.map((line, index) => (
        <Text
          key={index}
          color={isPlaceholder ? theme.textMuted : theme.text}
          dimColor={Boolean(isPlaceholder)}
        >
          {line || " "}
        </Text>
      ))}
    </Box>
  );
}
