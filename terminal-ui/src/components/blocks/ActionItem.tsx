/**
 * 单条工具执行 — 工具名 + 状态 + 可选错误
 *
 * 重构说明（Layer 4 - 执行/工具调用 子组件）：
 *  - pending：`~ tool_name`（textMuted gray，dimColor）— 进行中
 *  - success：`✓ tool_name`（success greenBright，bold）— 完成
 *  - error：  `✗ tool_name`（error red，bold）— 失败
 *  - 错误详情：paddingLeft={4}，red 色
 *  - 不再使用 StatusBadge，直接内联图标+颜色，语义更清晰
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import type { BadgeStatus } from "./StatusBadge.js";

interface ActionItemProps {
  tool: string;
  success?: boolean;
  done?: boolean;
  error?: string;
}

/** 各状态对应的终端图标 */
const ACTION_ICONS: Record<BadgeStatus, string> = {
  pending: "~",
  success: "✓",
  error: "✗",
  warning: "!",
};

export function ActionItem({ tool, success, done, error }: ActionItemProps) {
  const theme = useTheme();

  // 三态：未完成 → pending，完成且成功 → success，完成且失败 → error
  const status: BadgeStatus = !done ? "pending" : success ? "success" : "error";

  const icon = ACTION_ICONS[status];

  const color =
    status === "success"
      ? theme.success
      : status === "error"
        ? theme.error
        : theme.textMuted;

  const isBold = status === "success" || status === "error";
  const isDim = status === "pending";

  return (
    <Box flexDirection="column">
      {/* 状态图标 + 工具名，同色同权重 */}
      <Box flexDirection="row">
        <Text color={color} bold={isBold} dimColor={isDim}>
          {icon}{" "}
        </Text>
        <Text color={color} bold={isBold} dimColor={isDim}>
          {tool}
        </Text>
      </Box>

      {/* 错误详情：paddingLeft={4}，红色 */}
      {error ? (
        <Box paddingLeft={4}>
          <Text color={theme.error}>{error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
