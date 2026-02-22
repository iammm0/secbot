import React from 'react';
import { Box } from 'ink';
import { useDialog } from '../contexts/DialogContext.js';
import { useTheme } from '../contexts/ThemeContext.js';

interface DialogProps {
  width: number;
  height: number;
}

/** 对话框栈：顶层为全屏 backdrop + 居中内容区 */
export function Dialog({ width, height }: DialogProps) {
  const { stack } = useDialog();
  const theme = useTheme();
  if (stack.length === 0) return null;
  const top = stack[stack.length - 1];
  const contentWidth = Math.min(60, width - 4);
  const contentHeight = Math.min(20, height - 4);
  return (
    <Box position="absolute" width={width} height={height} justifyContent="center" alignItems="center">
      <Box
        width={contentWidth}
        height={contentHeight}
        borderStyle="round"
        borderColor={theme.borderActive}
        padding={1}
        flexDirection="column"
      >
        {top.element}
      </Box>
    </Box>
  );
}
