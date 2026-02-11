// ===================================================================
// 任务阶段指示器 — 对应 CLI TaskStatusComponent
// 显示当前阶段的旋转 spinner + 标签
// 阶段: planning(magenta) / thinking(cyan) / exec(yellow) / report(green) / done(green)
// Spinner: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
// ===================================================================

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize } from '../theme';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

type Phase = 'planning' | 'thinking' | 'exec' | 'report' | 'done';

const PHASE_CONFIG: Record<
  Phase,
  { emoji: string; tag: string; label: string; color: string }
> = {
  planning: {
    emoji: '📋',
    tag: 'Planning',
    label: '规划中...',
    color: '#E040FB',
  },
  thinking: {
    emoji: '💭',
    tag: 'Thinking',
    label: '推理中...',
    color: '#00BCD4',
  },
  exec: {
    emoji: '⚡',
    tag: 'Executing',
    label: '执行工具',
    color: '#FFD740',
  },
  report: {
    emoji: '📊',
    tag: 'Report',
    label: '生成报告中...',
    color: '#00E676',
  },
  done: {
    emoji: '✅',
    tag: 'Done',
    label: '任务完成',
    color: '#00E676',
  },
};

interface Props {
  phase: Phase;
  detail?: string;
}

export default function TaskPhaseIndicator({ phase, detail }: Props) {
  const [frame, setFrame] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === 'done') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase]);

  const config = PHASE_CONFIG[phase];

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{config.emoji}</Text>
      {phase !== 'done' && (
        <Text style={[styles.spinner, { color: config.color }]}>
          {SPINNER_FRAMES[frame]}
        </Text>
      )}
      <Text style={[styles.tag, { color: config.color }]}>{config.tag}</Text>
      <Text style={styles.label}>
        {config.label}
        {detail ? `: ${detail}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  emoji: {
    fontSize: 14,
  },
  spinner: {
    fontSize: FontSize.md,
    fontWeight: '700',
    width: 16,
    textAlign: 'center',
  },
  tag: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
