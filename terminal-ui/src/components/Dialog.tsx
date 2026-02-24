import React from 'react';
import { Box } from 'ink';
import { useDialog } from '../contexts/DialogContext.js';
import { useTheme } from '../contexts/ThemeContext.js';

interface DialogProps {
  width: number;
  height: number;
}

/** 对话框栈：全屏不透明遮罩 + 居中内容区，确保弹窗浮于主内容之上 */
export function Dialog({ width, height }: DialogProps) {
  const { stack } = useDialog();
  const theme = useTheme();
  if (stack.length === 0) return null;
  const top = stack[stack.length - 1];
  const contentWidth = Math.min(60, width - 4);
  const contentHeight = Math.min(22, height - 4);
  return (
    <Box
      position="absolute"
      width={width}
      height={height}
      backgroundColor={theme.background}
      justifyContent="center"
      alignItems="center"
    >
      <Box
        width={contentWidth}
        minHeight={contentHeight}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        backgroundColor={theme.backgroundPanel}
        borderStyle="round"
        borderColor={theme.border}
      >
        {top.element}
      </Box>
    </Box>
  );
}
