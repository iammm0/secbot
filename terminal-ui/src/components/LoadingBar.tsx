/**
 * 加载条 — 任务执行中时显示，带动画的进度指示
 * 根据 agent 正在执行的工作显示对应阶段标签
 */
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';

const BAR_WIDTH = 24;
const ANIMATION_MS = 120;

/** phase 到中文标签的映射 */
const PHASE_LABELS: Record<string, string> = {
  planning: '规划中',
  thinking: '推理中',
  exec: '工具执行',
  report: '报告生成',
  done: '完成',
};

interface LoadingBarProps {
  /** 是否显示 */
  active: boolean;
  /** 当前阶段（planning/thinking/exec/report/done） */
  phase?: string;
  /** 阶段详情（如具体工具名：端口扫描、漏洞扫描等），优先于 phase 映射显示 */
  detail?: string;
}

export function LoadingBar({ active, phase, detail }: LoadingBarProps) {
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

  const label = detail || (phase ? (PHASE_LABELS[phase] ?? phase) : '');

  return (
    <Box flexDirection="row" alignItems="center" paddingLeft={2} paddingRight={2}>
      <Text color={theme.primary}>[</Text>
      <Text color={theme.primary}>{bar.join('')}</Text>
      <Text color={theme.primary}>]</Text>
      <Text color={theme.textMuted}> 执行中</Text>
      {label ? (
        <Text color={theme.textMuted}> · {label}</Text>
      ) : null}
    </Box>
  );
}
