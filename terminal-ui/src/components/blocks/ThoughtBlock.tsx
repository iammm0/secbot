/**
 * 推理块 — 单步推理内容（ReAct Thought）
 *
 * 重构说明（Layer 2 - 推理）：
 *  - 标题行：`◇ 推理 #N`（accent/magenta，dimColor，bold）
 *  - 正文：每行前缀 `┊ `，整体 dimColor gray
 *  - 使用 renderMarkdown 渲染正文，保留 **加粗**、`代码` 等 Markdown 格式
 *  - 表达"内部思考，次要信息"的视觉感
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../renderMarkdown.js";

interface ThoughtBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function ThoughtBlock({ title, body, noMargin }: ThoughtBlockProps) {
  const theme = useTheme();
  // renderMarkdown 渲染后按行拆分，每行前缀 ┊，表达次要信息感
  const rendered = renderMarkdown(body || " ");
  const lines = rendered.split("\n");

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* 标题行：◇ 推理 #N — accent/magenta，dimColor，bold */}
      {title ? (
        <Text color={theme.accent} dimColor bold>
          {"◇ "}
          {title}
        </Text>
      ) : null}

      {/* 正文：前缀弱化；正文用默认前景色，避免 Windows 控制台 dim+gray 几乎不可读 */}
      {lines.map((line, i) => (
        <Box key={i} flexDirection="row">
          <Text dimColor color={theme.textMuted}>
            {"┊ "}
          </Text>
          <Text>{line || " "}</Text>
        </Box>
      ))}
    </Box>
  );
}
