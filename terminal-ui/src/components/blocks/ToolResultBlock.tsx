/**
 * 工具结果块 — 观察输出，标题 muted，正文 Markdown
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../renderMarkdown.js";

interface ToolResultBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

export function ToolResultBlock({
  title = "观察",
  body,
  noMargin,
  isPlaceholder,
}: ToolResultBlockProps) {
  const theme = useTheme();
  const rendered = isPlaceholder ? body || " " : renderMarkdown(body || " ");
  const lines = rendered.split("\n");

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      <Text color={theme.textMuted} dimColor>
        {title}
      </Text>
      <Box flexDirection="column" paddingLeft={2}>
        {lines.map((line, i) => (
          <Text key={i} color={theme.textMuted} dimColor={Boolean(isPlaceholder)}>
            {line || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
