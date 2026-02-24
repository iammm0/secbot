/**
 * 执行块 — 工具调用列表（有 actions 时用 ActionItem 逐条渲染）
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';
import { renderMarkdown } from '../../renderMarkdown.js';
import { ActionItem } from './ActionItem.js';
import type { ContentBlock } from '../../types.js';

interface ActionsBlockProps {
  block: ContentBlock;
  noMargin?: boolean;
}

export function ActionsBlock({ block, noMargin }: ActionsBlockProps) {
  const theme = useTheme();
  const title = block.title ?? '执行';
  const body = block.body || ' ';
  const hasActions = block.actions && block.actions.length > 0;

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 2}>
      <Text color={theme.primary} bold>
        {title}
      </Text>
      {hasActions ? (
        <Box flexDirection="column">
          {block.actions!.map((a, i) => (
            <ActionItem
              key={i}
              tool={a.tool}
              success={a.success}
              done={a.result !== undefined}
              error={a.error}
            />
          ))}
        </Box>
      ) : (
        <Text color={theme.text}>{renderMarkdown(body)}</Text>
      )}
    </Box>
  );
}
