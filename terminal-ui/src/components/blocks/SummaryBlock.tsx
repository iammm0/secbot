/**
 * 摘要块 — 最终总结/简要结论，支持多行 Markdown 渲染
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../renderMarkdown.js";

interface SummaryBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  /** 是否加粗 */
  bold?: boolean;
}

export function SummaryBlock({ title, body, noMargin, bold }: SummaryBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || " ");
  const lines = rendered.split("\n");

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {title ? (
        <Text color={theme.success} bold>
          {"◆ "}
          {title}
        </Text>
      ) : null}
      {lines.map((line, index) => (
        <Text key={index} color={theme.text} bold={bold}>
          {line || " "}
        </Text>
      ))}
    </Box>
  );
}
