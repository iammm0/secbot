import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';

const STARTUP_MESSAGES = [
  '正在初始化 SECBOT...',
  '加载安全能力模块...',
  '准备就绪，即将进入主界面',
];

interface StartupAnimationProps {
  onComplete: () => void;
  duration?: number;
}

export function StartupAnimation({ onComplete, duration = 1200 }: StartupAnimationProps) {
  const theme = useTheme();
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((value) => {
        if (value >= 100) return 100;
        return value + 4;
      });
    }, Math.max(16, Math.floor(duration / 25)));

    const messageInterval = setInterval(() => {
      setMessageIndex((index) => (index + 1) % STARTUP_MESSAGES.length);
    }, 350);

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
    <Box flexDirection="column" alignItems="center" justifyContent="center" width="100%" height="100%">
      <Box marginBottom={1}>
        <Text color={theme.primary} bold>
          SECBOT
        </Text>
      </Box>
      <Box marginBottom={2}>
        <Text color={theme.textMuted}>{STARTUP_MESSAGES[messageIndex]}</Text>
      </Box>
      <Box flexDirection="row">
        <Text color={theme.primary}>{'█'.repeat(filledWidth)}</Text>
        <Text color={theme.border}>{'░'.repeat(emptyWidth)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.textMuted}>{progress}%</Text>
      </Box>
    </Box>
  );
}
