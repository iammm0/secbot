/**
 * 用户消息块 — 在对话上下文中展示用户发送的内容，与 Secbot 回复区分
 *
 * 重构说明（Layer 0 - 用户消息）：
 *  - 去掉 borderStyle（视觉太重），改为顶部 ─ 分隔线
 *  - 前缀 `▶ ` + title（secondary/cyan，bold）
 *  - 若传入 sentAt，则在标题行右侧以 dim 色展示发送时间戳（HH:MM:SS）
 *  - 消息内容：正常白色文本，paddingLeft={2} 缩进
 *  - marginBottom={1} 保持块间距
 *
 * 时间格式：24 小时制，如 "14:23:05"
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";

interface UserMessageBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  /**
   * 用户发送该消息的时刻（Date.now()）。
   * 传入后在标题行右侧以 dim 色展示 HH:MM:SS 格式时间戳。
   */
  sentAt?: number;
}

/** 将 Date.now() 时间戳格式化为 HH:MM:SS（24 小时制） */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function UserMessageBlock({
  title = "用户",
  body,
  noMargin,
  sentAt,
}: UserMessageBlockProps) {
  const theme = useTheme();
  const lines = (body || " ").trim().split("\n");
  const timeLabel = sentAt && sentAt > 0 ? formatTime(sentAt) : null;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      {/* 顶部分隔线，dim gray，视觉轻量 */}
      <Text dimColor color={theme.border}>
        {"─".repeat(40)}
      </Text>

      {/* 标题行：▶ 用户  ·  HH:MM:SS */}
      <Box flexDirection="row">
        <Text color={theme.secondary} bold>
          {"▶ "}
          {title}
        </Text>
        {timeLabel ? (
          <>
            <Text dimColor color={theme.textMuted}>
              {"  ·  "}
            </Text>
            <Text dimColor color={theme.textMuted}>
              {timeLabel}
            </Text>
          </>
        ) : null}
      </Box>

      {/* 消息内容：white，paddingLeft={2} 缩进 */}
      <Box paddingLeft={2} flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i} color={theme.text}>
            {line || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
