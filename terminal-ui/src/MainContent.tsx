import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import type { StreamState } from './types.js';
import type { ContentBlock as ContentBlockType } from './types.js';
import { streamStateToBlocks } from './contentBlocks.js';
import { ContentBlock } from './components/ContentBlock.js';
import { useKeybind } from './contexts/KeybindContext.js';

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
  streamState: StreamState;
  streaming: boolean;
  apiOutput: string | null;
  contentHeight: number;
  scrollOffset: number;
  setScrollOffset: (updater: (prev: number) => number) => void;
  onLinesChange: (totalLines: number) => void;
  /** 是否显示右侧滚动条 */
  showScrollbar?: boolean;
}

export function MainContent({
  streamState,
  streaming,
  apiOutput,
  contentHeight,
  scrollOffset,
  setScrollOffset,
  onLinesChange,
  showScrollbar = true,
}: MainContentProps) {
  const keybind = useKeybind();
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

  const blocks = useMemo(
    () => streamStateToBlocks(streamState, streaming, apiOutput, dismissedTransientTools),
    [streamState, streaming, apiOutput, dismissedTransientTools]
  );

  const totalLines = useMemo(() => (blocks.length === 0 ? 0 : blocks[blocks.length - 1].lineEnd), [blocks]);
  const scrollableHeight = Math.max(1, contentHeight - 1);
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

  const spacerLines = useMemo(() => {
    if (visibleBlocks.length === 0) return 0;
    return Math.max(0, scrollOffset - visibleBlocks[0].lineStart);
  }, [visibleBlocks, scrollOffset]);

  const atTop = scrollOffset <= 0;
  const atBottom = totalLines <= scrollableHeight || scrollOffset >= totalLines - scrollableHeight;
  const rangeStart = totalLines === 0 ? 0 : scrollOffset + 1;
  const rangeEnd = totalLines === 0 ? 0 : Math.min(scrollOffset + scrollableHeight, totalLines);

  const scrollbarLines = useMemo(() => {
    const lines: string[] = [];
    const trackChar = '│';
    const thumbChar = '█';
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
              {visibleBlocks.map((block) => {
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
          <Box flexDirection="column" width={1} height={scrollableHeight} justifyContent="flex-start">
            {scrollbarLines.map((char, i) => (
              <Text key={i} dimColor={char === '│'}>{char}</Text>
            ))}
          </Box>
        )}
      </Box>
      <Box flexDirection="row">
        <Text color="dim">
          {totalLines > 0 ? ` ${rangeStart}-${rangeEnd}/${totalLines} 行 ` : ' '}
          ↑/↓ {keybind.print('page_up')}/{keybind.print('page_down')} Home/End 首/尾 点击滚动条
          {atTop ? '' : ' ↑'}
          {atBottom ? '' : ' ↓'}
        </Text>
      </Box>
    </Box>
  );
}
