/**
 * 规划块 — 规划内容与 Todo 列表（有 todos 时用 TodoList 渲染）
 *
 * 重构说明（Layer 3 - 规划）：
 *  - 标题行：`◈ 规划`（secondary/cyan，bold）
 *  - 有 todos 时：使用 TodoList 渲染
 *  - 无 todos 时：paddingLeft={2} 缩进，显示规划文本（去掉 renderMarkdown）
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { TodoList } from "./TodoList.js";
import type { ContentBlock } from "../../types.js";

interface PlanningBlockProps {
  block: ContentBlock;
  noMargin?: boolean;
}

export function PlanningBlock({ block, noMargin }: PlanningBlockProps) {
  const theme = useTheme();
  const title = block.title ?? "规划";
  const body = block.body || "";
  const hasTodos = block.todos && block.todos.length > 0;
  const trimmedBody = body.trim();
  const hasBody = trimmedBody.length > 0;
  const isStreaming = trimmedBody === "规划中…";

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* 标题行：◈ 规划 — secondary/cyan，bold */}
      <Text color={theme.secondary} bold>
        {"◈ "}
        {title}
      </Text>

      {hasBody ? (
        <Box paddingLeft={2}>
          <Text
            color={isStreaming ? theme.textMuted : theme.text}
            dimColor={isStreaming}
          >
            {trimmedBody}
          </Text>
        </Box>
      ) : null}

      {hasTodos ? (
        /* 有 todos：在说明文本后继续渲染待办列表 */
        <TodoList items={block.todos!} noMargin title={undefined} />
      ) : null}
    </Box>
  );
}
