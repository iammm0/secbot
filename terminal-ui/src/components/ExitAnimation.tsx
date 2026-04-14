/**
 * 退出动画组件 — 显示友好的退出画面，然后清理终端
 */
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';

const FAREWELL_MESSAGES = [
  '感谢使用 SECBOT',
  '安全测试，守护数字世界',
  '期待下次再见',
  'Goodbye! Stay secure.',
];

interface ExitAnimationProps {
  /** 动画完成后的回调 */
  onComplete: () => void;
  /** 动画持续时间（毫秒） */
  duration?: number;
}

export function ExitAnimation({ onComplete, duration = 1500 }: ExitAnimationProps) {
  const theme = useTheme();
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    // 进度动画
    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return p + 2;
      });
    }, duration / 50);

    // 消息轮播
    const messageInterval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % FAREWELL_MESSAGES.length);
    }, 400);

    // 动画完成后回调
    const completeTimeout = setTimeout(() => {
      onComplete();
    }, duration);

    return () => {
      clearInterval(progressInterval);
      clearInterval(messageInterval);
      clearTimeout(completeTimeout);
    };
  }, [duration, onComplete]);

  const progressBarWidth = 40;
  const filledWidth = Math.floor((progress / 100) * progressBarWidth);
  const emptyWidth = progressBarWidth - filledWidth;

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
    >
      {/* Logo */}
      <Box marginBottom={1}>
        <Text color={theme.success} bold>
          SECBOT
        </Text>
      </Box>

      {/* 动态消息 */}
      <Box marginBottom={2}>
        <Text color={theme.textMuted}>
          {FAREWELL_MESSAGES[messageIndex]}
        </Text>
      </Box>

      {/* 进度条 */}
      <Box flexDirection="row">
        <Text color={theme.success}>{'█'.repeat(filledWidth)}</Text>
        <Text color={theme.border}>{'░'.repeat(emptyWidth)}</Text>
      </Box>

      {/* 百分比 */}
      <Box marginTop={1}>
        <Text color={theme.textMuted}>{progress}%</Text>
      </Box>

      {/* 清理提示 */}
      {progress > 80 && (
        <Box marginTop={1}>
          <Text color={theme.warning} dimColor>
            正在清理终端...
          </Text>
        </Box>
      )}
    </Box>
  );
}
