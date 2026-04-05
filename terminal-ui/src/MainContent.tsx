/**
 * MainContent — 对话内容区（虚拟滚动 + 块渲染）
 *
 * 更新说明：
 *  1. 新增 currentUserMessage / currentSentAt / currentCompletedAt props，
 *     用于在当前轮次渲染正在进行（或刚结束）的用户消息气泡。
 *  2. 修复历史渲染：history 中每条已正确配对 (userMessage → streamState)，
 *     sentAt / completedAt 也从 HistoryItem 中读取并注入对应块。
 *  3. streamStateToBlocks 调用时传入 sentAt / completedAt，
 *     使 response 块能渲染完成时间脚注。
 *  4. UserMessageBlock 行数从 N+2 推算（separator + title + body）。
 */
import React, { useEffect, useRef, useMemo, useState } from "react";
import { Box, Text } from "ink";
import type { StreamState } from "./types.js";
import type { ContentBlock as ContentBlockType } from "./types.js";
import type { HistoryItem } from "./useChat.js";
import { streamStateToBlocks } from "./contentBlocks.js";
import { DiscriminatorPool } from "./blockDiscriminators/index.js";
import { ContentBlock } from "./components/ContentBlock.js";
import { TRANSIENT_TOOLS } from "./streamConstants.js";

// ─── 常量 ──────────────────────────────────────────────────────────────────────

/** 判别器池数量，用于批量判别时拆分加速 */
const POOL_SIZE = 3;

/** 完成后仅展示"完成"并在短暂延迟后从执行列表消失的工具 */
const TRANSIENT_TOOL_NAMES = TRANSIENT_TOOLS;
const TRANSIENT_DISMISS_MS = 2000;

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 按可见行范围裁剪块内容，避免逻辑行与终端实际行数不一致导致叠加。
 *
 * user_message 布局：separator(1) + title▶(1) + body(N) → headerLines = 2
 * 其余有标题块：title(1) + body(N) → headerLines = 1
 * 无标题块：body(N) → headerLines = 0
 */
function sliceBlockForVisibleRange(
  block: ContentBlockType,
  visibleLineStart: number,
  visibleLineEnd: number,
): ContentBlockType {
  const localStart = visibleLineStart - block.lineStart;
  const localEnd = visibleLineEnd - block.lineStart;

  // user_message 渲染：分隔线(1) + 标题行▶(1) + 内容(N) = 2 行 header
  // 其他有标题的块：标题(1) + 内容(N) = 1 行 header
  const headerLines = block.type === "user_message" ? 2 : block.title ? 1 : 0;

  const bodyLines = (block.body || "").split("\n");
  const bodyStart = Math.max(0, localStart - headerLines);
  const bodyEnd = Math.max(0, localEnd - headerLines);
  const slicedBody = bodyLines.slice(bodyStart, bodyEnd).join("\n");

  // 当 localStart < headerLines 时，头部行（分隔线/标题）仍在可见区内，显示标题
  const showTitle = Boolean(block.title) && localStart < headerLines;

  return {
    ...block,
    title: showTitle ? block.title : undefined,
    body: slicedBody || " ",
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MainContentProps {
  history: HistoryItem[];
  streamState: StreamState;
  streaming: boolean;
  apiOutput: string | null;
  contentHeight: number;
  scrollOffset: number;
  setScrollOffset: (updater: (prev: number) => number) => void;
  onLinesChange: (totalLines: number) => void;
  /** 是否显示右侧滚动条 */
  showScrollbar?: boolean;

  // ── 当前轮次信息（来自 useChat / SyncContext） ────────────────────────────────
  /** 当前正在进行（或刚完成）的轮次：用户消息文本，空字符串表示尚无当前轮次 */
  currentUserMessage?: string;
  /** 当前轮次用户消息的发送时刻（Date.now()），0 表示尚未开始 */
  currentSentAt?: number;
  /** 当前轮次 Secbot 响应的完成时刻（Date.now()），0 表示尚未完成 */
  currentCompletedAt?: number;
}

// ─── 组件 ──────────────────────────────────────────────────────────────────────

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
  currentUserMessage = "",
  currentSentAt = 0,
  currentCompletedAt = 0,
}: MainContentProps) {
  const [dismissedTransientTools, setDismissedTransientTools] = useState<
    Set<string>
  >(new Set());

  // 瞬时工具在完成后延迟消失
  useEffect(() => {
    const completed = streamState.actions.filter(
      (a) =>
        TRANSIENT_TOOL_NAMES.has(a.tool) &&
        a.result !== undefined &&
        !dismissedTransientTools.has(a.tool),
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

  // ── 构建全量块列表 ────────────────────────────────────────────────────────────

  const blocks = useMemo(() => {
    let lineOffset = 0;
    const allBlocks: ContentBlockType[] = [];

    // ── 历史轮次 ────────────────────────────────────────────────────────────────
    // 每条 HistoryItem 现已正确配对：userMessage → 触发该响应的用户消息
    history.forEach((item, idx) => {
      const msg = item.userMessage.trim();

      // UserMessageBlock 渲染：separator(1) + title▶(1) + body(N) = N+2 行
      const userLineCount = Math.max(2, msg ? msg.split("\n").length + 2 : 2);
      allBlocks.push({
        id: `h${idx}-user`,
        type: "user_message",
        title: "用户",
        body: msg || "(空)",
        lineStart: lineOffset,
        lineEnd: lineOffset + userLineCount,
        sentAt: item.sentAt > 0 ? item.sentAt : undefined,
      });
      lineOffset += userLineCount;

      // 历史轮次的 Secbot 响应块（sentAt / completedAt 传入，response 块可渲染脚注）
      const histBlocks = streamStateToBlocks(
        item.streamState,
        false,
        null,
        dismissedTransientTools,
        item.sentAt > 0 ? item.sentAt : undefined,
        item.completedAt > 0 ? item.completedAt : undefined,
      ).map((b) => ({
        ...b,
        id: `h${idx}-${b.id}`,
        lineStart: b.lineStart + lineOffset,
        lineEnd: b.lineEnd + lineOffset,
      }));

      if (histBlocks.length > 0) {
        lineOffset = histBlocks[histBlocks.length - 1].lineEnd;
        allBlocks.push(...histBlocks);
      }
    });

    // ── 当前轮次用户消息 ─────────────────────────────────────────────────────────
    // 只要 currentUserMessage 非空，就渲染出来（不论是否仍在流式中）
    if (currentUserMessage.trim()) {
      const msg = currentUserMessage.trim();
      const userLineCount = Math.max(2, msg.split("\n").length + 2);
      allBlocks.push({
        id: "current-user",
        type: "user_message",
        title: "用户",
        body: msg,
        lineStart: lineOffset,
        lineEnd: lineOffset + userLineCount,
        sentAt: currentSentAt > 0 ? currentSentAt : undefined,
      });
      lineOffset += userLineCount;
    }

    // ── 当前轮次 Secbot 响应块 ────────────────────────────────────────────────
    const currentBlocks = streamStateToBlocks(
      streamState,
      streaming,
      apiOutput,
      dismissedTransientTools,
      currentSentAt > 0 ? currentSentAt : undefined,
      currentCompletedAt > 0 ? currentCompletedAt : undefined,
    ).map((b) => ({
      ...b,
      id: `c-${b.id}`,
      lineStart: b.lineStart + lineOffset,
      lineEnd: b.lineEnd + lineOffset,
    }));

    allBlocks.push(...currentBlocks);
    return allBlocks;
  }, [
    history,
    streamState,
    streaming,
    apiOutput,
    dismissedTransientTools,
    currentUserMessage,
    currentSentAt,
    currentCompletedAt,
  ]);

  // ── 滚动计算 ──────────────────────────────────────────────────────────────────

  const totalLines = useMemo(
    () => (blocks.length === 0 ? 0 : blocks[blocks.length - 1].lineEnd),
    [blocks],
  );
  const scrollableHeight = Math.max(1, contentHeight);
  const prevTotalRef = useRef<number>(0);

  useEffect(() => {
    onLinesChange(totalLines);
  }, [totalLines, onLinesChange]);

  // 新内容到达时，若视口在底部附近则自动跟随
  useEffect(() => {
    const prev = prevTotalRef.current;
    prevTotalRef.current = totalLines;
    if (prev === 0) return;
    if (totalLines > prev && scrollOffset + scrollableHeight >= prev) {
      setScrollOffset(() => Math.max(0, totalLines - scrollableHeight));
    }
  }, [totalLines, scrollableHeight, scrollOffset, setScrollOffset]);

  // ── 可见块计算 ────────────────────────────────────────────────────────────────

  const visibleBlocks = useMemo(() => {
    const end = scrollOffset + scrollableHeight;
    return blocks.filter((b) => b.lineEnd > scrollOffset && b.lineStart < end);
  }, [blocks, scrollOffset, scrollableHeight]);

  /** 经判别模块预解析的可见块，多个池实例并行处理 */
  const discriminatedBlocks = useMemo(() => {
    if (visibleBlocks.length === 0) return [];
    const pools = Array.from({ length: POOL_SIZE }, () =>
      DiscriminatorPool.create(),
    );
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

  // ── 滚动条 ────────────────────────────────────────────────────────────────────
  // 使用单列 ASCII 字符，避免 CJK 等环境下双宽字符导致溢出乱码

  const scrollbarLines = useMemo(() => {
    const lines: string[] = [];
    const trackChar = "|";
    const thumbChar = "#";
    if (totalLines <= scrollableHeight) {
      for (let i = 0; i < scrollableHeight; i++) lines.push(trackChar);
    } else {
      const thumbHeight = Math.max(
        1,
        Math.round(scrollableHeight * (scrollableHeight / totalLines)),
      );
      const maxScrollRange = totalLines - scrollableHeight;
      let thumbTop = Math.round(
        (scrollOffset / maxScrollRange) * (scrollableHeight - thumbHeight),
      );
      thumbTop = Math.max(
        0,
        Math.min(scrollableHeight - thumbHeight, thumbTop),
      );
      for (let i = 0; i < scrollableHeight; i++) {
        lines.push(
          thumbTop <= i && i < thumbTop + thumbHeight ? thumbChar : trackChar,
        );
      }
    }
    return lines;
  }, [totalLines, scrollableHeight, scrollOffset]);

  const shouldShowScrollbar = showScrollbar && totalLines > scrollableHeight;

  // ── 渲染 ──────────────────────────────────────────────────────────────────────

  if (contentHeight <= 0) return null;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
      overflow="hidden"
      height={contentHeight}
    >
      <Box flexDirection="row" height={scrollableHeight} overflow="hidden">
        {/* 内容列 */}
        <Box
          flexDirection="column"
          flexGrow={1}
          minWidth={0}
          overflow="hidden"
          height={scrollableHeight}
          paddingRight={shouldShowScrollbar ? 1 : 0}
        >
          {blocks.length === 0 ? (
            <Text color="dim">暂无输出，输入消息或斜杠命令开始</Text>
          ) : (
            <>
              {/* 顶部空白占位（虚拟滚动） */}
              {spacerLines > 0 &&
                Array.from({ length: spacerLines }, (_, i) => (
                  <Text key={`spacer-${i}`}> </Text>
                ))}

              {/* 可见块渲染 */}
              {discriminatedBlocks.map((block) => {
                const visibleLineStart = Math.max(
                  scrollOffset,
                  block.lineStart,
                );
                const visibleLineEnd = Math.min(
                  scrollOffset + scrollableHeight,
                  block.lineEnd,
                );
                const lineCount = visibleLineEnd - visibleLineStart;
                const slicedBlock = sliceBlockForVisibleRange(
                  block,
                  visibleLineStart,
                  visibleLineEnd,
                );
                return (
                  <Box
                    key={block.id}
                    flexDirection="column"
                    height={lineCount}
                    overflow="hidden"
                    minHeight={lineCount}
                    paddingLeft={1}
                  >
                    <ContentBlock block={slicedBlock} noMargin />
                  </Box>
                );
              })}
            </>
          )}
        </Box>

        {/* 滚动条 */}
        {shouldShowScrollbar && (
          <Box
            flexDirection="column"
            width={1}
            height={scrollableHeight}
            justifyContent="flex-start"
            overflow="hidden"
          >
            {scrollbarLines.map((char, i) => (
              <Text key={i} dimColor={char === "|"}>
                {char}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
