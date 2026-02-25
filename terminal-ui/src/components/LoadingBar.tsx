/**
 * 加载条 — 任务执行中时显示，带动画的进度指示
 */
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';

const BAR_WIDTH = 24;
const ANIMATION_MS = 120;

interface LoadingBarProps {
  /** 是否显示 */
  active: boolean;
  /** 当前阶段描述（可选） */
  phase?: string;
}

export function LoadingBar({ active, phase }: LoadingBarProps) {
  const theme = useTheme();
  const [pos, setPos] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setPos((p) => {
        const next = p + direction;
        if (next >= BAR_WIDTH - 1) {
          setDirection(-1);
          return BAR_WIDTH - 1;
        }
        if (next <= 0) {
          setDirection(1);
          return 0;
        }
        return next;
      });
    }, ANIMATION_MS);
    return () => clearInterval(id);
  }, [active, direction]);

  if (!active) return null;

  const i = Math.floor(pos);
  const bar = '░'.repeat(BAR_WIDTH).split('');
  bar[i] = '█';

  return (
    <Box flexDirection="row" alignItems="center" paddingLeft={2} paddingRight={2}>
      <Text color={theme.primary}>[</Text>
      <Text color={theme.primary}>{bar.join('')}</Text>
      <Text color={theme.primary}>]</Text>
      <Text color={theme.textMuted}> 执行中</Text>
      {phase ? (
        <Text color={theme.textMuted}> · {phase}</Text>
      ) : null}
    </Box>
  );
}
