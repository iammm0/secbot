/**
 * 探索块 — 联网检索 / web_research 等查询结果
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../render/renderMarkdown.js";

interface ExploringBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

export function ExploringBlock({
  title,
  body,
  noMargin,
  isPlaceholder,
}: ExploringBlockProps) {
  const theme = useTheme();
  const rendered = isPlaceholder ? body || " " : renderMarkdown(body || " ");
  const lines = rendered.split("\n");
  const head = title || "探索";

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      <Text color={theme.textMuted} dimColor>
        {head}
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
