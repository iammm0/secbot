/**
 * 错误块 — 错误信息，醒目红色
 *
 * 重构说明（Layer - 错误）：
 *  - 标题行：`✗ 错误`（error/red，bold）
 *  - 正文：行首两空格缩进，整块单 Text（避免嵌套 Box padding + 多行 Text 在窄终端裁切首字）
 *  - 去掉 renderMarkdown（错误通常是纯文本，无需 markdown 渲染）
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

interface ErrorBlockProps {
  body: string;
  noMargin?: boolean;
}

export function ErrorBlock({ body, noMargin }: ErrorBlockProps) {
  const theme = useTheme();
  const lines = (body || " ").split("\n");
  const indentedBody = lines
    .map((line) => `  ${line || " "}`)
    .join("\n");

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* 标题行：✗ 错误 — error/red，bold */}
      <Text color={theme.error} bold>
        {"✗ 错误"}
      </Text>

      {/* 正文：整块一个 Text，由换行分段；不用带 padding 的子 Box，避免 Ink 布局吃掉行首宽字符 */}
      <Text color={theme.error}>{indentedBody}</Text>
    </Box>
  );
}
