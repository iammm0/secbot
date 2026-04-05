/**
 * 多会话选择 — /sessions 弹出，↑↓ 选择，Enter 切换
 */
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useDialog } from "../contexts/DialogContext.js";
import { useTheme } from "../contexts/ThemeContext.js";
import { useToast } from "../contexts/ToastContext.js";
import type { SessionListEntry } from "../useChat.js";

interface SessionSelectDialogProps {
  sessions: SessionListEntry[];
  onSelect: (id: string) => void;
}

export function SessionSelectDialog({
  sessions,
  onSelect,
}: SessionSelectDialogProps) {
  const { pop } = useDialog();
  const theme = useTheme();
  const toast = useToast();
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = sessions.findIndex((s) => s.isActive);
    return idx >= 0 ? idx : 0;
  });

  useInput((_input, key) => {
    if (key.escape) {
      pop();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(sessions.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const sel = sessions[selectedIndex];
      if (sel) {
        onSelect(sel.id);
        toast.show({ message: `已切换到：${sel.label}`, variant: "success" });
        pop();
      }
    }
  });

  if (sessions.length === 0) {
    return (
      <Text color={theme.warning}>暂无会话记录。使用 /new-session 新建。</Text>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color={theme.primary}>
        切换会话
      </Text>
      <Text color={theme.textMuted}>↑↓ 选择 · Enter 确认 · Esc 关闭</Text>
      <Box flexDirection="column" marginTop={1}>
        {sessions.map((s, i) => {
          const selected = i === selectedIndex;
          return (
            <Box key={s.id} flexDirection="row">
              <Text
                color={selected ? theme.primary : theme.text}
                bold={selected}
              >
                {selected ? "> " : "  "}
                {s.label}
                {s.isActive ? " (当前)" : ""}
              </Text>
              <Text color={theme.textMuted}> — {s.id}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
