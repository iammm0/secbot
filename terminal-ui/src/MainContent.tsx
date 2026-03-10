import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import type { StreamState } from './types.js';
import type { ContentBlock as ContentBlockType } from './types.js';
import { streamStateToBlocks } from './contentBlocks.js';
import { DiscriminatorPool } from './blockDiscriminators/index.js';
import { ContentBlock } from './components/ContentBlock.js';

/** 判别器池数量，用于批量判别时拆分加速 */
const POOL_SIZE = 3;

/** 完成后仅展示“完成”并在短暂延迟后从执行列表消失的工具 */
const TRANSIENT_TOOL_NAMES = new Set(['system_info', 'network_analyze']);
const TRANSIENT_DISMISS_MS = 2000;

/** 按可见行范围裁剪块内容，避免逻辑行与终端实际行数不一致导致叠加 */
function sliceBlockForVisibleRange(
  block: ContentBlockType,
  visibleLineStart: number,
  visibleLineEnd: number
): ContentBlockType {
  const localStart = visibleLineStart - block.lineStart;
  const localEnd = visibleLineEnd - block.lineStart;
  const hasTitle = Boolean(block.title);
  const bodyLines = (block.body || '').split('\n');
  const bodyStart = hasTitle ? Math.max(0, localStart - 1) : localStart;
  const bodyEnd = hasTitle ? localEnd - 1 : localEnd;
  const slicedBody = bodyLines.slice(bodyStart, bodyEnd).join('\n');
  const showTitle = hasTitle && localStart === 0;
  return {
    ...block,
    title: showTitle ? block.title : undefined,
    body: slicedBody || ' ',
  };
}

interface MainContentProps {
  history: StreamState[];
  streamState: StreamState;
  streaming: boolean;
  apiOutput: string | null;
  contentHeight: number;
  scrollOffset: number;
  setScrollOffset: (updater: (prev: number) => number) => void;
  onLinesChange: (totalLines: number) => void;
  /** 是否显示右侧滚动条 */
  showScrollbar?: boolean;
  /** 已展开的块 id（工具/API 结果等默认折叠，展开后加入此集合） */
  expandedBlockIds?: Set<string>;
}

export function MainContent({
  history,
  streamState,
  streaming,
  apiOutput,
  contentHeight,
  scrollOffset,
  setScrollOffset,
  onLinesChange,
  showScrollbar = true,
  expandedBlockIds = new Set(),
}: MainContentProps) {
  const [dismissedTransientTools, setDismissedTransientTools] = useState<Set<string>>(new Set());

  useEffect(() => {
    const completed = streamState.actions.filter(
      (a) => TRANSIENT_TOOL_NAMES.has(a.tool) && a.result !== undefined && !dismissedTransientTools.has(a.tool)
    );
    if (completed.length === 0) return;
    const id = setTimeout(() => {
      setDismissedTransientTools((prev) => {
        const next = new Set(prev);
        completed.forEach((a) => next.add(a.tool));
        return next;
      });
    }, TRANSIENT_DISMISS_MS);
    return () => clearTimeout(id);
  }, [streamState.actions, dismissedTransientTools]);

  const blocks = useMemo(() => {
    let lineOffset = 0;
    const allBlocks: ContentBlockType[] = [];

    history.forEach((h, idx) => {
      const histBlocks = streamStateToBlocks(h, false, null, dismissedTransientTools, expandedBlockIds).map(
        (b) => ({
          ...b,
          id: `h${idx}-${b.id}`,
          lineStart: b.lineStart + lineOffset,
          lineEnd: b.lineEnd + lineOffset,
        })
      );
      if (histBlocks.length > 0) {
        lineOffset = histBlocks[histBlocks.length - 1].lineEnd;
        allBlocks.push(...histBlocks);
      }
    });

    const currentBlocks = streamStateToBlocks(
      streamState,
      streaming,
      apiOutput,
      dismissedTransientTools,
      expandedBlockIds
    ).map((b) => ({
      ...b,
      id: `c-${b.id}`,
      lineStart: b.lineStart + lineOffset,
      lineEnd: b.lineEnd + lineOffset,
    }));

    allBlocks.push(...currentBlocks);
    return allBlocks;
  }, [history, streamState, streaming, apiOutput, dismissedTransientTools, expandedBlockIds]);

  const totalLines = useMemo(() => (blocks.length === 0 ? 0 : blocks[blocks.length - 1].lineEnd), [blocks]);
  const scrollableHeight = Math.max(1, contentHeight);
  const prevTotalRef = useRef<number>(0);

  useEffect(() => {
    onLinesChange(totalLines);
  }, [totalLines, onLinesChange]);

  useEffect(() => {
    const prev = prevTotalRef.current;
    prevTotalRef.current = totalLines;
    if (prev === 0) return;
    if (totalLines > prev && scrollOffset + scrollableHeight >= prev) {
      setScrollOffset(() => Math.max(0, totalLines - scrollableHeight));
    }
  }, [totalLines, scrollableHeight, scrollOffset, setScrollOffset]);

  const visibleBlocks = useMemo(() => {
    const end = scrollOffset + scrollableHeight;
    return blocks.filter((b) => b.lineEnd > scrollOffset && b.lineStart < end);
  }, [blocks, scrollOffset, scrollableHeight]);

  /** 经判别模块预解析的可见块，多个池实例并行处理 */
  const discriminatedBlocks = useMemo(() => {
    if (visibleBlocks.length === 0) return [];
    const pools = Array.from({ length: POOL_SIZE }, () => DiscriminatorPool.create());
    return visibleBlocks.map((block, i) => {
      const pool = pools[i % POOL_SIZE];
      const resolvedType = pool.discriminate(block);
      return { ...block, resolvedType };
    });
  }, [visibleBlocks]);

  const spacerLines = useMemo(() => {
    if (visibleBlocks.length === 0) return 0;
    return Math.max(0, scrollOffset - visibleBlocks[0].lineStart);
  }, [visibleBlocks, scrollOffset]);

  // 使用单列 ASCII 字符，避免 CJK 等环境下双宽字符导致溢出乱码
  const scrollbarLines = useMemo(() => {
    const lines: string[] = [];
    const trackChar = '|';
    const thumbChar = '#';
    if (totalLines <= scrollableHeight) {
      for (let i = 0; i < scrollableHeight; i++) lines.push(trackChar);
    } else {
      const thumbHeight = Math.max(1, Math.round(scrollableHeight * (scrollableHeight / totalLines)));
      const maxScrollRange = totalLines - scrollableHeight;
      let thumbTop = Math.round((scrollOffset / maxScrollRange) * (scrollableHeight - thumbHeight));
      thumbTop = Math.max(0, Math.min(scrollableHeight - thumbHeight, thumbTop));
      for (let i = 0; i < scrollableHeight; i++) {
        lines.push(thumbTop <= i && i < thumbTop + thumbHeight ? thumbChar : trackChar);
      }
    }
    return lines;
  }, [totalLines, scrollableHeight, scrollOffset]);

  if (contentHeight <= 0) return null;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden" height={contentHeight}>
      <Box flexDirection="row" height={scrollableHeight} overflow="hidden">
        <Box flexDirection="column" flexGrow={1} minWidth={0} overflow="hidden" height={scrollableHeight}>
          {blocks.length === 0 ? (
            <Text color="dim">暂无输出，输入消息或斜杠命令开始</Text>
          ) : (
            <>
              {spacerLines > 0 &&
                Array.from({ length: spacerLines }, (_, i) => <Text key={`spacer-${i}`}> </Text>)}
              {discriminatedBlocks.map((block) => {
                const visibleLineStart = Math.max(scrollOffset, block.lineStart);
                const visibleLineEnd = Math.min(scrollOffset + scrollableHeight, block.lineEnd);
                const lineCount = visibleLineEnd - visibleLineStart;
                const slicedBlock = sliceBlockForVisibleRange(block, visibleLineStart, visibleLineEnd);
                return (
                  <Box
                    key={block.id}
                    flexDirection="column"
                    height={lineCount}
                    overflow="hidden"
                    minHeight={lineCount}
                  >
                    <ContentBlock block={slicedBlock} noMargin />
                  </Box>
                );
              })}
            </>
          )}
        </Box>
        {showScrollbar && (
          <Box flexDirection="column" width={1} height={scrollableHeight} justifyContent="flex-start" overflow="hidden">
            {scrollbarLines.map((char, i) => (
              <Text key={i} dimColor={char === '|'}>{char}</Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
