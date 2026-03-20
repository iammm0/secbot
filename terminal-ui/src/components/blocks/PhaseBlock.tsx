/**
 * 阶段块 — 流式时的当前阶段（phase + detail）
 *
 * 重构说明（Layer 1 - 状态指示）：
 *  - 前缀 `~ ` 表示"进行中/临时状态"
 *  - 内容 dim gray，无标题
 *  - 去掉 renderMarkdown，直接显示纯文本（phase 通常是简单状态消息）
 *  - 仅显示 body 的第一行
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

interface PhaseBlockProps {
  body: string;
  noMargin?: boolean;
}

export function PhaseBlock({ body, noMargin }: PhaseBlockProps) {
  const theme = useTheme();
  // 仅取第一行，phase 是简单的一行状态消息
  const firstLine = (body || " ").split("\n")[0] || " ";

  return (
    <Box flexDirection="row" marginBottom={noMargin ? 0 : 1}>
      <Text dimColor color={theme.textMuted}>
        {"~ "}
      </Text>
      <Text dimColor color={theme.textMuted}>
        {firstLine}
      </Text>
    </Box>
  );
}
