/**
 * 工具列表展示对话框 — 美观、规范、易于阅读
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';
import { useDialog } from '../contexts/DialogContext.js';
import { api } from '../api.js';

interface Tool {
  name: string;
  description: string;
  category: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
  tools: Tool[];
}

interface ToolsData {
  total: number;
  basic_count: number;
  advanced_count: number;
  categories: Category[];
}

const CATEGORY_ICONS: Record<string, string> = {
  security: '🔐',
  defense: '🛡️',
  utility: '🔧',
  protocol: '📡',
  osint: '🔍',
  cloud: '☁️',
  reporting: '📊',
  control: '🎮',
  crawler: '🕷️',
  web_research: '🌐',
};

const CATEGORY_NAMES: Record<string, string> = {
  security: '核心安全',
  defense: '防御',
  utility: '实用工具',
  protocol: '协议探测',
  osint: 'OSINT',
  cloud: '云安全',
  reporting: '报告',
  control: '控制',
  crawler: '爬虫',
  web_research: 'Web研究',
};

const MAX_VISIBLE_TOOLS = 20;
const SIDEBAR_WIDTH = 18;

export function ToolsDialog() {
  const theme = useTheme();
  const { pop } = useDialog();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ToolsData | null>(null);
  const [selectedCategoryIdx, setSelectedCategoryIdx] = useState(0);
  const [toolScrollOffset, setToolScrollOffset] = useState(0);

  useEffect(() => {
    api.get<ToolsData>('/api/tools')
      .then(setData)
      .catch((e) => setError(String((e as Error).message)))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const selectedCategory = categories[selectedCategoryIdx];
  const tools = selectedCategory?.tools ?? [];
  const maxToolScroll = Math.max(0, tools.length - MAX_VISIBLE_TOOLS);

  useInput((_input, key) => {
    if (key.escape) {
      pop();
      return;
    }

    if (loading || error || categories.length === 0) return;

    // 左右切换分类
    if (key.leftArrow) {
      setSelectedCategoryIdx((idx) => {
        const newIdx = Math.max(0, idx - 1);
        setToolScrollOffset(0);
        return newIdx;
      });
      return;
    }
    if (key.rightArrow) {
      setSelectedCategoryIdx((idx) => {
        const newIdx = Math.min(categories.length - 1, idx + 1);
        setToolScrollOffset(0);
        return newIdx;
      });
      return;
    }

    // 上下滚动工具列表
    if (key.upArrow) {
      setToolScrollOffset((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow) {
      setToolScrollOffset((s) => Math.min(maxToolScroll, s + 1));
      return;
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={theme.primary}>🔧 SECBOT 内置工具</Text>
        <Box marginTop={1}>
          <Text color={theme.textMuted}>加载中...</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={theme.primary}>🔧 SECBOT 内置工具</Text>
        <Box marginTop={1}>
          <Text color={theme.error}>加载失败: {error}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.textMuted}>按 Esc 关闭</Text>
        </Box>
      </Box>
    );
  }

  if (!data || categories.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={theme.primary}>🔧 SECBOT 内置工具</Text>
        <Box marginTop={1}>
          <Text color={theme.textMuted}>暂无工具数据</Text>
        </Box>
      </Box>
    );
  }

  const visibleTools = tools.slice(toolScrollOffset, toolScrollOffset + MAX_VISIBLE_TOOLS);
  const hasMoreTools = tools.length > MAX_VISIBLE_TOOLS;

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题栏 */}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text bold color={theme.primary}>
          🔧 SECBOT 内置工具
        </Text>
        <Text color={theme.success}>
          总计 {data.total} 个
        </Text>
      </Box>

      {/* 分隔线 */}
      <Box marginY={1}>
        <Text color={theme.border}>{'─'.repeat(60)}</Text>
      </Box>

      {/* 分类导航栏 */}
      <Box flexDirection="row" flexWrap="wrap" gap={1} marginBottom={1}>
        {categories.map((cat, idx) => {
          const isSelected = idx === selectedCategoryIdx;
          const icon = CATEGORY_ICONS[cat.id] || '📦';
          return (
            <Box key={cat.id}>
              <Text
                bold={isSelected}
                color={isSelected ? theme.success : theme.textMuted}
                backgroundColor={isSelected ? undefined : undefined}
              >
                {isSelected ? '▸ ' : ''}{icon} {CATEGORY_NAMES[cat.id] || cat.name}({cat.count})
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* 当前分类标题 */}
      <Box marginY={1}>
        <Text bold color={theme.warning}>
          {CATEGORY_ICONS[selectedCategory.id] || '📦'} {CATEGORY_NAMES[selectedCategory.id] || selectedCategory.name}
          <Text color={theme.textMuted}> — {selectedCategory.count} 个工具</Text>
        </Text>
      </Box>

      {/* 工具列表 */}
      <Box flexDirection="column">
        {visibleTools.map((tool, idx) => {
          const actualIdx = toolScrollOffset + idx;
          const isLast = idx === visibleTools.length - 1 && hasMoreTools;
          return (
            <Box key={`${tool.name}-${actualIdx}`} flexDirection="row" marginY={0}>
              <Box width={SIDEBAR_WIDTH}>
                <Text color={theme.success} bold>
                  {'  '}{tool.name}
                </Text>
              </Box>
              <Box flexGrow={1}>
                <Text color={theme.text}>
                  {tool.description}
                </Text>
              </Box>
            </Box>
          );
        })}
        {hasMoreTools && (
          <Box marginTop={1}>
            <Text color={theme.textMuted}>
              {'  '}... 还有 {tools.length - MAX_VISIBLE_TOOLS} 个工具 (↓滚动查看更多)
            </Text>
          </Box>
        )}
      </Box>

      {/* 底部提示 */}
      <Box marginTop={1}>
        <Text color={theme.textMuted}>
          ←→ 切换分类  ↑↓ 滚动  Esc 关闭
          {hasMoreTools && ` · ${toolScrollOffset + 1}-${Math.min(toolScrollOffset + MAX_VISIBLE_TOOLS, tools.length)}/${tools.length}`}
        </Text>
      </Box>
    </Box>
  );
}
