/**
 * Todo 列表 — 规划中的待办项，带状态
 *
 * 重构说明（Layer 3 - 规划 子组件）：
 *  - pending：`○ 内容`（textMuted gray）
 *  - done/success：`● 内容`（success greenBright）
 *  - error：`✗ 内容`（error red）
 *  - paddingLeft={2} 统一缩进，不依赖 StatusBadge
 *  - marginBottom 统一改为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import type { TodoItemData } from "../../types.js";

interface TodoListProps {
  items: TodoItemData[];
  noMargin?: boolean;
  title?: string;
}

type TodoStatus = "pending" | "success" | "error";

function resolveStatus(s?: string): TodoStatus {
  if (!s) return "pending";
  const lower = s.toLowerCase();
  if (lower === "done" || lower === "completed" || lower === "完成")
    return "success";
  if (lower === "failed" || lower === "失败") return "error";
  return "pending";
}

const TODO_ICONS: Record<TodoStatus, string> = {
  pending: "○",
  success: "●",
  error: "✗",
};

export function TodoList({ items, noMargin, title }: TodoListProps) {
  const theme = useTheme();

  if (items.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1} paddingLeft={2}>
      {/* 可选标题行（secondary/cyan，bold） */}
      {title ? (
        <Text color={theme.secondary} bold>
          {title}
        </Text>
      ) : null}

      {items.map((item, i) => {
        const status = resolveStatus(item.status);
        const icon = TODO_ICONS[status];

        const color =
          status === "success"
            ? theme.success
            : status === "error"
              ? theme.error
              : theme.textMuted;

        const isDim = status === "pending";

        return (
          <Box key={i} flexDirection="row">
            {/* 状态图标：○ / ● / ✗，语义色 */}
            <Text color={color} dimColor={isDim}>
              {icon}{" "}
            </Text>
            {/* 内容文字与图标同色 */}
            <Text color={color} dimColor={isDim}>
              {item.content}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
