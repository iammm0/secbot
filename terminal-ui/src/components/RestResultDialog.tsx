/**
 * REST 结果弹窗 — 请求一段内容后在弹窗中展示，Esc 关闭
 * 与 ModelConfigDialog 同级的显示控制组件，用于 /help、/list-agents 等
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';

const MAX_VISIBLE_LINES = 18;

interface RestResultDialogProps {
  title: string;
  fetchContent: () => Promise<string>;
}

export function RestResultDialog({ title, fetchContent }: RestResultDialogProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    fetchContent()
      .then(setContent)
      .catch((e) => setError(String((e as Error).message)))
      .finally(() => setLoading(false));
  }, [fetchContent]);

  const lines = content.split('\n');
  const totalLines = lines.length;
  const maxScroll = Math.max(0, totalLines - MAX_VISIBLE_LINES);

  useInput((_input, key) => {
    // Esc 不在此 pop()，由 App 统一 clear()，避免与 App 竞态导致 hasDialog 再次为 true
    if (key.escape) return;
    if (!loading && !error && totalLines > MAX_VISIBLE_LINES) {
      if (key.upArrow) {
        setScrollOffset((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow) {
        setScrollOffset((s) => Math.min(maxScroll, s + 1));
        return;
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={0} paddingY={0}>
        <Text bold color={theme.primary}>{title}</Text>
        <Text color={theme.textMuted}>加载中…</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={0} paddingY={0}>
        <Text bold color={theme.primary}>{title}</Text>
        <Text color={theme.error}>{error}</Text>
        <Text color={theme.textMuted}>Esc 关闭</Text>
      </Box>
    );
  }

  const visibleLines = lines.slice(scrollOffset, scrollOffset + MAX_VISIBLE_LINES);

  return (
    <Box flexDirection="column" paddingX={0} paddingY={0}>
      <Text bold color={theme.primary}>{title}</Text>
      <Text color={theme.textMuted}>
        {totalLines > MAX_VISIBLE_LINES
          ? `↑↓ 滚动 · Esc 关闭 (${scrollOffset + 1}-${scrollOffset + visibleLines.length}/${totalLines})`
          : 'Esc 关闭'}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {visibleLines.map((line, i) => (
          <Text key={i} color={theme.text}>
            {line || ' '}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
