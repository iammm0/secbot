/**
 * 智能体选择对话框 — /agent 命令弹出，↑↓ 选择，Enter 确认切换
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useDialog } from '../contexts/DialogContext.js';
import { isInkEscape } from '../contexts/KeybindContext.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { useLocal } from '../contexts/LocalContext.js';
import { useToast } from '../contexts/ToastContext.js';

const AGENTS = [
  { id: 'secbot-cli', label: 'Hackbot', description: '开源版标准安全测试智能体' },
  { id: 'superhackbot', label: 'SuperHackbot', description: '开源版高级安全测试智能体' },
];

export function AgentSelectDialog() {
  const { pop } = useDialog();
  const theme = useTheme();
  const { agent, setAgent } = useLocal();
  const toast = useToast();
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = AGENTS.findIndex((a) => a.id === agent);
    return idx >= 0 ? idx : 0;
  });

  useInput((input, key) => {
    if (isInkEscape(input, key)) {
      pop();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(AGENTS.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const selected = AGENTS[selectedIndex];
      if (selected) {
        setAgent(selected.id);
        toast.show({ message: `已切换到 ${selected.label}`, variant: 'success' });
        pop();
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.primary}>
        切换智能体
      </Text>
      <Text color={theme.textMuted}>↑↓ 选择 · Enter 确认 · Esc 关闭</Text>
      <Box flexDirection="column" marginTop={1}>
        {AGENTS.map((a, i) => {
          const isSelected = i === selectedIndex;
          const isCurrent = a.id === agent;
          return (
            <Box key={a.id} flexDirection="row">
              <Text color={isSelected ? theme.primary : theme.text} bold={isSelected}>
                {isSelected ? '> ' : '  '}
                {a.label}
                {isCurrent ? ' (当前)' : ''}
              </Text>
              <Text color={theme.textMuted}> — {a.description}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
