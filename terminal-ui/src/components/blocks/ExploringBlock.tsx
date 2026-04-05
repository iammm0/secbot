/**
 * 探索块 — 联网检索 / web_research / MCP 等不确定信息的查询结果
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../renderMarkdown.js";

interface ExploringBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function ExploringBlock({ title, body, noMargin }: ExploringBlockProps) {
  const theme = useTheme();
  const rendered = renderMarkdown(body || " ");
  const lines = rendered.split("\n");
  const head = title || "探索";

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      <Text color={theme.secondary} bold>
        {"◆ "}
        {head}
      </Text>
      <Box flexDirection="column" paddingLeft={2}>
        {lines.map((line, i) => (
          <Text key={i} color={theme.text}>
            {line || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
