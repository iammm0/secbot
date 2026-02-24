import React from 'react';
import { Box } from 'ink';
import { useDialog } from '../contexts/DialogContext.js';

interface DialogProps {
  width: number;
  height: number;
}

/** 对话框栈：全屏 overlay + 居中内容区 */
export function Dialog({ width, height }: DialogProps) {
  const { stack } = useDialog();
  if (stack.length === 0) return null;
  const top = stack[stack.length - 1];
  const contentWidth = Math.min(60, width - 4);
  const contentHeight = Math.min(22, height - 4);
  return (
    <Box position="absolute" width={width} height={height} justifyContent="center" alignItems="center">
      <Box
        width={contentWidth}
        minHeight={contentHeight}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
      >
        {top.element}
      </Box>
    </Box>
  );
}
