/**
 * 阶段状态条 — 任务执行中时显示当前阶段与执行进度
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';

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
  /** 工具调用总数 */
  actionTotal?: number;
  /** 已完成工具调用数 */
  actionCompleted?: number;
}

export function LoadingBar({
  active,
  phase,
  detail,
  actionTotal = 0,
  actionCompleted = 0,
}: LoadingBarProps) {
  const theme = useTheme();

  if (!active) return null;

  const label = detail || (phase ? (PHASE_LABELS[phase] ?? phase) : '准备中');
  const toolProgress =
    actionTotal > 0 ? `${Math.min(actionCompleted, actionTotal)}/${actionTotal}` : null;

  return (
    <Box flexDirection="row" alignItems="center" paddingLeft={2} paddingRight={2}>
      <Text color={theme.primary}>[RUNNING]</Text>
      <Text color={theme.textMuted}> 阶段: </Text>
      <Text color={theme.primary}>{label}</Text>
      {toolProgress ? <Text color={theme.textMuted}> · 工具: {toolProgress}</Text> : null}
    </Box>
  );
}
