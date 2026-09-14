/**
 * 执行块 — 工具调用一行展示，过程信息压低，不与观察块抢 ▸ 前缀
 *
 *  - 进行中：`~ tool · arg`
 *  - 完成：  `✓ tool · arg`
 *  - 失败：  `✗ tool · arg`
 *  - 有 actions 列表时仍用 ActionItem 逐条渲染
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
  const title = block.title ?? "工具调用";
  const errorLine = (block.body || "").trim();
  const hasActions = Boolean(block.actions && block.actions.length > 0);
  const status = block.actionStatus ?? (errorLine ? "error" : "done");
  const icon = status === "running" ? "~" : status === "error" ? "✗" : "✓";
  const color =
    status === "error"
      ? theme.error
      : status === "running"
        ? theme.warning
        : theme.textMuted;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      <Text color={color} dimColor={status !== "error"} bold={status === "error"}>
        {icon} {title}
      </Text>

      {hasActions ? (
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
      ) : errorLine ? (
        <Box paddingLeft={3}>
          <Text color={theme.error}>{errorLine}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
