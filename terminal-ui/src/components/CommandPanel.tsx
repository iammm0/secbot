import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useCommand } from '../contexts/CommandContext.js';
import { useDialog } from '../contexts/DialogContext.js';
import { useTheme } from '../contexts/ThemeContext.js';

export function CommandPanel() {
  const { commands } = useCommand();
  const { clear } = useDialog();
  const theme = useTheme();
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!filter.trim()) return commands;
    const f = filter.toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(f) ||
        (c.slash ?? '').toLowerCase().includes(f) ||
        c.category.toLowerCase().includes(f)
    );
  }, [commands, filter]);

  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  useInput((input, key) => {
    if (key.escape) {
      clear();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const cmd = filtered[safeIndex];
      if (cmd) cmd.onSelect({ close: clear });
      clear();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.primary}>命令面板 — 输入过滤，Enter 执行，Esc 关闭</Text>
      <Box flexDirection="column" marginTop={1}>
        {filtered.slice(0, 15).map((cmd, i) => (
          <Box key={cmd.value}>
            <Text color={i === safeIndex ? theme.primary : theme.text}>
              {i === safeIndex ? '> ' : '  '}
              {cmd.slash ?? cmd.value} — {cmd.title}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
