/**
 * 回复块 — 最终回复/总结（Layer 6，最醒目）
 *
 * 重构说明：
 *  - 标题行：`╔ 回复`（success/greenBright，bold）
 *  - 正文：每行前缀 `║ `（success 色）+ 内容（theme.text）
 *  - isPlaceholder 时退化为普通 dim 样式（无边框装饰）
 *  - 新增 completedAt / durationMs：
 *      当 completedAt 有效（> 0）时，在正文末尾渲染一行完成时间脚注：
 *      `  ✓ 完成  ·  HH:MM:SS  ·  耗时 Xs`
 *  - 使用 renderMarkdown 保留富文本格式
 *  - marginBottom 统一为 1
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import { renderMarkdown } from "../../renderMarkdown.js";

// ─── 时间格式工具 ──────────────────────────────────────────────────────────────

/** Date.now() → "HH:MM:SS"（24 小时制） */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * 毫秒 → 人类可读耗时字符串
 *  < 1 000ms  → "XXXms"
 *  ≥ 1 000ms  → "X.Xs"
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── 组件 Props ────────────────────────────────────────────────────────────────

interface ResponseBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  /** 是否为折叠占位（仅显示一行提示，不渲染 ╔ 边框） */
  isPlaceholder?: boolean;
  /**
   * Secbot 响应完成的时刻（Date.now()）。
   * 大于 0 时在正文下方渲染完成时间脚注行。
   */
  completedAt?: number;
  /**
   * 从用户发送到响应完成的耗时（毫秒）。
   * 与 completedAt 配合使用，显示 "耗时 Xs"。
   */
  durationMs?: number;
}

// ─── 组件 ──────────────────────────────────────────────────────────────────────

export function ResponseBlock({
  title = "回复",
  body,
  noMargin,
  isPlaceholder,
  completedAt,
  durationMs,
}: ResponseBlockProps) {
  const theme = useTheme();

  // ── Placeholder 模式：退化为 dim 样式 ────────────────────────────────────────
  if (isPlaceholder) {
    return (
      <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
        <Text color={theme.textMuted} dimColor>
          {title}
        </Text>
        <Text color={theme.textMuted} dimColor>
          {body || " "}
        </Text>
      </Box>
    );
  }

  // ── 正常模式 ──────────────────────────────────────────────────────────────────
  const rendered = renderMarkdown(body || " ");
  const lines = rendered.split("\n");

  // 有效的 completedAt（> 0 且非 NaN）
  const validCompletedAt =
    completedAt && completedAt > 0 && !Number.isNaN(completedAt)
      ? completedAt
      : null;

  // 脚注文本：  ✓ 完成  ·  HH:MM:SS  ·  耗时 Xs
  const footerTimeStr = validCompletedAt ? formatTime(validCompletedAt) : null;
  const footerDurStr =
    durationMs != null && durationMs > 0 ? formatDuration(durationMs) : null;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* ── 标题行：╔ 回复 ── */}
      <Text color={theme.success} bold>
        {"╔ "}
        {title}
      </Text>

      {/* ── 正文：每行 ║ 前缀 ── */}
      {lines.map((line, i) => (
        <Box key={i} flexDirection="row">
          <Text color={theme.success}>{"║ "}</Text>
          <Text color={theme.text}>{line || " "}</Text>
        </Box>
      ))}

      {/* ── 完成时间脚注（仅 completedAt 有效时渲染） ── */}
      {footerTimeStr ? (
        <Box flexDirection="row" paddingLeft={2} marginTop={0}>
          {/* ✓ 完成 */}
          <Text color={theme.success} bold>
            {"✓ 完成"}
          </Text>

          {/* · HH:MM:SS */}
          <Text dimColor color={theme.textMuted}>
            {"  ·  "}
          </Text>
          <Text dimColor color={theme.textMuted}>
            {footerTimeStr}
          </Text>

          {/* · 耗时 Xs（可选） */}
          {footerDurStr ? (
            <>
              <Text dimColor color={theme.textMuted}>
                {"  ·  耗时 "}
              </Text>
              <Text dimColor color={theme.textMuted}>
                {footerDurStr}
              </Text>
            </>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
