import React, { useState, useMemo } from 'react';
import fuzzysort from 'fuzzysort';
import { Box, Text, useInput } from 'ink';
import { useCommand } from '../contexts/CommandContext.js';
import { useDialog } from '../contexts/DialogContext.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { useKeybind } from '../contexts/KeybindContext.js';
import type { KeybindId } from '../contexts/KeybindContext.js';
import type { CommandOption } from '../contexts/CommandContext.js';

export function CommandPanel() {
  const { commands } = useCommand();
  const { pop } = useDialog();
  const theme = useTheme();
  const keybind = useKeybind();
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const close = pop;

  const filtered = useMemo(() => {
    if (!filter.trim()) return commands;
    const results = fuzzysort.go(filter, commands, {
      keys: ['title', 'slash', 'category'],
      threshold: -10000,
    });
    return results.map((r) => r.obj as CommandOption);
  }, [commands, filter]);

  const safeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  useInput((input, key) => {
    if (key.escape) {
      close();
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
      if (cmd) cmd.onSelect({ close });
      close();
    }
  });

  const toShow = useMemo(
    () => filtered.slice(0, 15).map((cmd, index) => ({ cmd, index })),
    [filtered]
  );
  const byCategory = useMemo(() => {
    const map = new Map<string, { cmd: typeof filtered[0]; index: number }[]>();
    for (const { cmd, index } of toShow) {
      const cat = cmd.category || '其他';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push({ cmd, index });
    }
    return Array.from(map.entries());
  }, [toShow]);

  return (
    <Box flexDirection="column">
      <Text bold color={theme.primary}>
        命令面板 — 输入过滤，Enter 执行，Esc 关闭
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {byCategory.map(([category, items]) => (
          <Box key={category} flexDirection="column">
            <Text color={theme.textMuted}>{category}</Text>
            {items.map(({ cmd, index }) => {
              const isSelected = index === safeIndex;
              const keybindLabel = cmd.keybind ? keybind.print(cmd.keybind as KeybindId) : '';
              return (
                <Box key={cmd.value}>
                  <Text color={isSelected ? theme.primary : theme.text}>
                    {isSelected ? '> ' : '  '}
                    {cmd.slash ?? cmd.value} — {cmd.title}
                    {keybindLabel ? ` (${keybindLabel})` : ''}
                  </Text>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
