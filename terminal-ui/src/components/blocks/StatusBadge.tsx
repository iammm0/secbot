/**
 * 状态徽标 — ✓ / ✗ / ~ / ! 等，统一样式
 *
 * 重构说明（通用状态图标）：
 *  - pending：`~`（textMuted gray）— 表示进行中/等待
 *  - success：`✓`（success greenBright）
 *  - error：  `✗`（error red）
 *  - warning：`!`（warning yellow）
 *  - 颜色语义固定，不混用
 */
import React from "react";
import { Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

export type BadgeStatus = "success" | "error" | "pending" | "warning";

const SYMBOLS: Record<BadgeStatus, string> = {
  success: "✓",
  error: "✗",
  pending: "~",
  warning: "!",
};

interface StatusBadgeProps {
  status: BadgeStatus;
  /** 可选文字，如 "完成" / "失败" */
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const theme = useTheme();

  const color =
    status === "success"
      ? theme.success
      : status === "error"
        ? theme.error
        : status === "warning"
          ? theme.warning
          : theme.textMuted;

  const isDim = status === "pending";
  const sym = SYMBOLS[status];

  return (
    <Text color={color} dimColor={isDim}>
      {sym}
      {label ? ` ${label}` : ""}
    </Text>
  );
}
