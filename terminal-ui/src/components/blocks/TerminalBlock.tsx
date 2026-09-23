/**
 * 终端块 — 命令输出，标题 muted，正文 Markdown
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../render/renderMarkdown.js";

interface TerminalBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

export function TerminalBlock({
  title = "终端",
  body,
  noMargin,
  isPlaceholder,
}: TerminalBlockProps) {
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
          <Text key={i} color={isPlaceholder ? theme.textMuted : theme.text} dimColor={Boolean(isPlaceholder)}>
            {line || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
