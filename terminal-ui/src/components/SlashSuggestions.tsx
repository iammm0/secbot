/**
 * 键入 / 后显示的可选命令列表 — 两列：命令 / 描述，高亮当前项
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';
import type { CommandOption } from '../contexts/CommandContext.js';

interface SlashSuggestionsProps {
  commands: CommandOption[];
  selectedIndex: number;
  /** 当前输入（如 "/" 或 "/pl"），用于过滤 */
  filter: string;
}

const MAX_VISIBLE = 12;
const CMD_WIDTH = 14;

export function SlashSuggestions({ commands, selectedIndex, filter }: SlashSuggestionsProps) {
  const theme = useTheme();

  const filtered = React.useMemo(() => {
    if (!filter.startsWith('/')) return [];
    const rest = filter.slice(1).toLowerCase();
    return commands
      .filter((c) => c.slash && c.slash.toLowerCase().startsWith(filter.toLowerCase()))
      .slice(0, MAX_VISIBLE);
  }, [commands, filter]);

  if (filtered.length === 0) return null;

  const safeIndex = Math.min(Math.max(0, selectedIndex), filtered.length - 1);

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={0} paddingRight={0}>
      {filtered.map((cmd, i) => {
        const selected = i === safeIndex;
        const slash = cmd.slash ?? cmd.value;
        const desc = cmd.title;
        return (
          <Box key={cmd.value} flexDirection="row">
            <Text color={selected ? theme.primary : theme.text} bold={selected}>
              {slash.padEnd(CMD_WIDTH)}
            </Text>
            <Text color={selected ? theme.primary : theme.textMuted}>{desc}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
