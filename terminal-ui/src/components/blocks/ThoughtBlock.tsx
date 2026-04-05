/**
 * 推理块 — 单步推理内容（ReAct Thought）
 *
 * 重构说明（Layer 2 - 推理）：
 *  - 标题行：`◇ 推理 #N`（accent/magenta，dimColor，bold）
 *  - 正文：每行前缀 `┊ `，整体 dimColor gray
 *  - 去掉 renderMarkdown，直接显示纯文本（推理链通常是简单文本）
 *  - 表达"内部思考，次要信息"的视觉感
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

interface ThoughtBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
}

export function ThoughtBlock({ title, body, noMargin }: ThoughtBlockProps) {
  const theme = useTheme();
  // 按行拆分，每行前缀 ┊，表达次要信息感
  const lines = (body || " ").split("\n");

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
          <Text color={theme.text}>{line || " "}</Text>
        </Box>
      ))}
    </Box>
  );
}
