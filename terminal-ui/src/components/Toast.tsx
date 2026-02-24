import React from 'react';
import { Box, Text } from 'ink';
import { useToast } from '../contexts/ToastContext.js';
import { useTheme } from '../contexts/ThemeContext.js';

/** Toast — opencode 式：backgroundPanel 感、左侧/边框用 variant 色 */
export function Toast() {
  const { currentToast } = useToast();
  const theme = useTheme();
  if (!currentToast) return null;
  const color = currentToast.variant === 'error' ? theme.error
    : currentToast.variant === 'success' ? theme.success
    : currentToast.variant === 'warning' ? theme.warning
    : theme.info;
  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} marginRight={2}>
      {currentToast.title ? (
        <Text bold color={theme.text}>{currentToast.title}</Text>
      ) : null}
      <Text color={theme.text}>{currentToast.message}</Text>
    </Box>
  );
}
