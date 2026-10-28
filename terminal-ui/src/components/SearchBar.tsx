/**
 * 搜索条 — 会话内搜索输入行（Ctrl+F 唤起，Enter/Shift+Enter 切换命中）
 */
import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "../contexts/ThemeContext.js";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  matchIndex: number;
  matchCount: number;
  nextLabel: string;
  prevLabel: string;
}

export function SearchBar({
  value,
  onChange,
  matchIndex,
  matchCount,
  nextLabel,
  prevLabel,
}: SearchBarProps) {
  const theme = useTheme();
  const counter =
    matchCount > 0 ? `${matchIndex + 1}/${matchCount}` : "0/0";

  return (
    <Box flexShrink={0} flexDirection="row" paddingLeft={2} paddingRight={2}>
      <Text color={theme.secondary} bold>
        {"» "}
      </Text>
      <TextInput value={value} onChange={onChange} placeholder="输入关键词搜索" />
      <Box marginLeft={1} flexShrink={0}>
        <Text
          color={matchCount > 0 ? theme.success : theme.textMuted}
          bold={matchCount > 0}
        >
          {counter}
        </Text>
      </Box>
      <Text color={theme.textMuted} dimColor wrap="truncate">
        {` · ${nextLabel} 下一个 · ${prevLabel} 上一个 · Esc 关闭`}
      </Text>
    </Box>
  );
}
