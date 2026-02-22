import React from 'react';
import { Box, Text } from 'ink';
import { useToast } from '../contexts/ToastContext.js';
import { useTheme } from '../contexts/ThemeContext.js';

export function Toast() {
  const { currentToast } = useToast();
  const theme = useTheme();
  if (!currentToast) return null;
  const color = currentToast.variant === 'error' ? theme.error
    : currentToast.variant === 'success' ? theme.success
    : currentToast.variant === 'warning' ? theme.warning
    : theme.info;
  return (
    <Box position="absolute" top={0} right={2} flexDirection="column" borderStyle="single" borderColor={color} paddingX={1} paddingY={0}>
      {currentToast.title ? (
        <Text bold color={color}>{currentToast.title}</Text>
      ) : null}
      <Text color={currentToast.title ? theme.text : color}>{currentToast.message}</Text>
    </Box>
  );
}
