import React from 'react';
import { Box } from 'ink';
import { useDialog } from '../contexts/DialogContext.js';
import { useTheme } from '../contexts/ThemeContext.js';

interface DialogProps {
  width: number;
  height: number;
}

/** 对话框栈：全屏遮罩 + 居中内容区。
 *  Esc 由各弹窗组件自行处理（必要时调用 pop/clear），避免统一 clear() 破坏多步骤返回流程。
 */
export function Dialog({ width, height }: DialogProps) {
  const { stack } = useDialog();
  const theme = useTheme();

  if (stack.length === 0) return null;
  const top = stack[stack.length - 1];
  const contentWidth = Math.min(96, width - 4);
  const contentHeight = Math.min(36, height - 4);
  // Ink 类型定义在当前项目里没有把 backgroundColor 暴露给 Box props，
  // 但运行时是被支持的；这里仅在显式提供主题背景时设置，默认继承终端主题。
  const overlayProps: Record<string, unknown> = {
    position: 'absolute',
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
  };
  if (theme.background) {
    overlayProps.backgroundColor = theme.background;
  }

  const panelProps: Record<string, unknown> = {
    width: contentWidth,
    minHeight: contentHeight,
    paddingX: 2,
    paddingY: 1,
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: theme.border,
  };
  if (theme.backgroundPanel) {
    panelProps.backgroundColor = theme.backgroundPanel;
  }
  return (
    <Box {...(overlayProps as any)}>
      <Box {...(panelProps as any)}>
        {top.element}
      </Box>
    </Box>
  );
}
