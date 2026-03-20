/**
 * 执行块 — 工具调用列表（有 actions 时用 ActionItem 逐条渲染）
 *
 * 重构说明（Layer 4 - 执行/工具调用）：
 *  - 标题行：`⚙ 执行`（primary/green，bold）
 *  - 有 actions 时：paddingLeft={2} + ActionItem 列表
 *  - 无 actions 时：paddingLeft={2} 显示 body 文本（去掉 renderMarkdown）
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { ActionItem } from "./ActionItem.js";
import type { ContentBlock } from "../../types.js";

interface ActionsBlockProps {
  block: ContentBlock;
  noMargin?: boolean;
}

export function ActionsBlock({ block, noMargin }: ActionsBlockProps) {
  const theme = useTheme();
  const title = block.title ?? "执行";
  const body = block.body || " ";
  const hasActions = block.actions && block.actions.length > 0;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* 标题行：⚙ 执行 — primary/green，bold */}
      <Text color={theme.primary} bold>
        {"⚙ "}
        {title}
      </Text>

      {hasActions ? (
        /* 有 actions：paddingLeft={2} 缩进列表 */
        <Box flexDirection="column" paddingLeft={2}>
          {block.actions!.map((a, i) => (
            <ActionItem
              key={i}
              tool={a.tool}
              success={a.success}
              done={a.result !== undefined}
              error={a.error}
            />
          ))}
        </Box>
      ) : (
        /* 无 actions：缩进显示 body 文本 */
        <Box paddingLeft={2}>
          <Text color={theme.text}>{body}</Text>
        </Box>
      )}
    </Box>
  );
}
