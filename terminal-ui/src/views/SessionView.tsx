/**
 * 会话视图 — 主区 + 斜杠命令建议 + 输入 + 底部状态栏
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { MainContent } from '../MainContent.js';
import { SlashSuggestions } from '../components/SlashSuggestions.js';
import { parseSlash, getAgentFromState } from '../slash.js';
import { isSimpleGreetingOrNonTask } from '../intent.js';
import { useSync, useLocal, useTheme, useKeybind, useCommand } from '../contexts/index.js';
import { inkKeyToParsedKey } from '../contexts/KeybindContext.js';
import { streamStateToBlocks } from '../contentBlocks.js';

const CONTENT_HEIGHT_OFFSET = 8;

interface SessionViewProps {
  columns: number;
  rows: number;
  /** 从首页带过来的初始输入，进入会话时预填 */
  initialPrompt?: string;
}

export function SessionView({ columns, rows, initialPrompt }: SessionViewProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [totalLines, setTotalLines] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [hasAppliedInitialPrompt, setHasAppliedInitialPrompt] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [showScrollbar, setShowScrollbar] = useState(true);
  const { commands, register } = useCommand();
  const totalLinesRef = useRef(0);
  const scrollableHeightRef = useRef(1);

  useEffect(() => {
    if (initialPrompt && !hasAppliedInitialPrompt) {
      setInputValue(initialPrompt);
      setHasAppliedInitialPrompt(true);
    }
  }, [initialPrompt, hasAppliedInitialPrompt]);
  const theme = useTheme();
  const sync = useSync();
  const local = useLocal();
  const keybind = useKeybind();
  const { streaming, streamState, apiOutput, sendMessage, setRESTOutput } = sync;
  const { mode, agent, setMode, setAgent } = local;

  const contentHeight = useMemo(() => Math.max(8, rows - CONTENT_HEIGHT_OFFSET), [rows]);
  const scrollableHeight = Math.max(1, contentHeight - 1);
  const maxScroll = Math.max(0, totalLines - scrollableHeight);

  const blocks = useMemo(
    () => streamStateToBlocks(streamState, streaming, apiOutput),
    [streamState, streaming, apiOutput]
  );

  useEffect(() => {
    totalLinesRef.current = totalLines;
    scrollableHeightRef.current = scrollableHeight;
  }, [totalLines, scrollableHeight]);

  const slashSuggestions = useMemo(() => {
    if (!inputValue.startsWith('/')) return [];
    const f = inputValue.toLowerCase();
    return commands.filter((c) => c.slash && c.slash.toLowerCase().startsWith(f)).slice(0, 12);
  }, [commands, inputValue]);

  useEffect(() => {
    setScrollOffset((s) => Math.min(s, maxScroll));
  }, [maxScroll]);

  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [inputValue]);

  const findNextBlockOffset = useCallback(
    (direction: 'next' | 'prev'): number | null => {
      if (blocks.length === 0) return null;
      if (direction === 'next') {
        const next = blocks.find((b) => b.lineStart >= scrollOffset + scrollableHeight);
        return next ? next.lineStart : null;
      }
      const prev = [...blocks].reverse().find((b) => b.lineEnd <= scrollOffset);
      return prev ? prev.lineStart : null;
    },
    [blocks, scrollOffset, scrollableHeight]
  );

  const scrollToNextBlock = useCallback(
    (direction: 'next' | 'prev') => {
      const offset = findNextBlockOffset(direction);
      if (offset !== null) {
        setScrollOffset(Math.min(maxScroll, Math.max(0, offset)));
        return;
      }
      const half = Math.max(1, Math.floor(scrollableHeight / 2));
      if (direction === 'next') setScrollOffset((s) => Math.min(maxScroll, s + half));
      else setScrollOffset((s) => Math.max(0, s - half));
    },
    [findNextBlockOffset, maxScroll, scrollableHeight]
  );

  const toBottom = useCallback(() => {
    setTimeout(() => {
      setScrollOffset(Math.max(0, totalLinesRef.current - scrollableHeightRef.current));
    }, 50);
  }, []);

  useEffect(() => {
    const unregs = [
      register({
        title: '切换消息区滚动条',
        value: 'session.toggle.scrollbar',
        category: '会话',
        onSelect: ({ close }) => {
          setShowScrollbar((v) => !v);
          close();
        },
      }),
      register({
        title: '首条消息',
        value: 'session.first',
        category: '会话',
        keybind: 'messages_first',
        onSelect: ({ close }) => {
          setScrollOffset(0);
          close();
        },
      }),
      register({
        title: '末条消息',
        value: 'session.last',
        category: '会话',
        keybind: 'messages_last',
        onSelect: ({ close }) => {
          setScrollOffset(maxScroll);
          close();
        },
      }),
      register({
        title: '半页上',
        value: 'session.half.page.up',
        category: '会话',
        keybind: 'messages_half_page_up',
        onSelect: ({ close }) => {
          setScrollOffset((s) => Math.max(0, s - Math.max(1, Math.floor(scrollableHeight / 2))));
          close();
        },
      }),
      register({
        title: '半页下',
        value: 'session.half.page.down',
        category: '会话',
        keybind: 'messages_half_page_down',
        onSelect: ({ close }) => {
          setScrollOffset((s) => Math.min(maxScroll, s + Math.max(1, Math.floor(scrollableHeight / 2))));
          close();
        },
      }),
      register({
        title: '上一条消息',
        value: 'session.message.previous',
        category: '会话',
        keybind: 'messages_previous',
        onSelect: ({ close }) => {
          scrollToNextBlock('prev');
          close();
        },
      }),
      register({
        title: '下一条消息',
        value: 'session.message.next',
        category: '会话',
        keybind: 'messages_next',
        onSelect: ({ close }) => {
          scrollToNextBlock('next');
          close();
        },
      }),
    ];
    return () => unregs.forEach((u) => u());
  }, [register, maxScroll, scrollableHeight, scrollToNextBlock]);

  // 启用鼠标跟踪，便于点击滚动条跳转
  useEffect(() => {
    const stdout = typeof process !== 'undefined' && process.stdout;
    if (!stdout?.write) return;
    stdout.write('\x1b[?1006h');
    return () => {
      stdout.write('\x1b[?1006l');
    };
  }, []);

  /** 消息区域在终端中的起始行（1-based）：App padding 1 + 主内容首行 */
  const messageAreaTop = 2;
  /** 滚动条列在终端中的 x（1-based）：右侧最后一列 */
  const scrollbarColumnX = columns;

  useInput((input, key) => {
    const keyWithMouse = key as typeof key & {
      mouse?: { x: number; y: number; button: string; action: string };
    };
    if (keyWithMouse.mouse && keyWithMouse.mouse.button === 'left') {
      const { x, y } = keyWithMouse.mouse;
      if (
        totalLines > scrollableHeight &&
        x >= scrollbarColumnX - 1 &&
        y >= messageAreaTop &&
        y < messageAreaTop + scrollableHeight
      ) {
        const clickRow = y - messageAreaTop;
        const newOffset =
          scrollableHeight <= 1
            ? 0
            : Math.min(maxScroll, Math.max(0, Math.round((clickRow / (scrollableHeight - 1)) * maxScroll)));
        setScrollOffset(newOffset);
        return;
      }
    }

    const evt = inkKeyToParsedKey(input, key);
    if (keybind.match('page_up', evt)) {
      setScrollOffset((s) => Math.max(0, s - contentHeight));
      return;
    }
    if (keybind.match('page_down', evt)) {
      setScrollOffset((s) => Math.min(maxScroll, s + contentHeight));
      return;
    }
    if (keybind.match('messages_first', evt)) {
      setScrollOffset(0);
      return;
    }
    if (keybind.match('messages_last', evt)) {
      setScrollOffset(maxScroll);
      return;
    }
    if (keybind.match('messages_half_page_up', evt)) {
      setScrollOffset((s) => Math.max(0, s - Math.max(1, Math.floor(scrollableHeight / 2))));
      return;
    }
    if (keybind.match('messages_half_page_down', evt)) {
      setScrollOffset((s) => Math.min(maxScroll, s + Math.max(1, Math.floor(scrollableHeight / 2))));
      return;
    }
    if (keybind.match('messages_previous', evt)) {
      scrollToNextBlock('prev');
      return;
    }
    if (keybind.match('messages_next', evt)) {
      scrollToNextBlock('next');
      return;
    }
    if (slashSuggestions.length > 0) {
      if (key.upArrow) {
        setSlashSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSlashSelectedIndex((i) => Math.min(slashSuggestions.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const selected = slashSuggestions[Math.min(slashSelectedIndex, slashSuggestions.length - 1)];
        if (selected) {
          handleSubmit(selected.value);
        }
        return;
      }
      if (key.escape) {
        setInputValue('');
        return;
      }
    } else {
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

  const handleSubmit = useCallback(
    (valueOr?: string) => {
      const trimmed = (valueOr ?? inputValue).trim();
      if (!trimmed) return;

      if (trimmed.startsWith('/')) {
        const result = parseSlash(trimmed, { mode, agent });
        if (result.handled) {
          setAgent(getAgentFromState(trimmed, agent));
          if (result.chat && result.chat.message) {
            setMode(result.chat.mode);
            sendMessage(result.chat.message, result.chat.mode, result.chat.agent);
            setInputValue('');
            toBottom();
            return;
          }
          if (result.chat && !result.chat.message) {
            setMode(result.chat.mode);
            setInputValue('');
            return;
          }
          if (result.fetchThen) {
            setRESTOutput('加载中…');
            result
              .fetchThen()
              .then(setRESTOutput)
              .catch((err) => setRESTOutput(`错误: ${err.message}`));
            setInputValue('');
            return;
          }
          setInputValue('');
          return;
        }
      }

      const effectiveMode = isSimpleGreetingOrNonTask(trimmed) ? 'ask' : mode;
      sendMessage(trimmed, effectiveMode, agent);
      setInputValue('');
      toBottom();
    },
    [mode, agent, sendMessage, setRESTOutput, setMode, setAgent, inputValue, toBottom]
  );

  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      {/* 主对话区 — 单栏、无边框、块间距 */}
      <Box flexDirection="column" flexGrow={1} minWidth={0} paddingLeft={2} paddingRight={2}>
        <MainContent
          streamState={streamState}
          streaming={streaming}
          apiOutput={apiOutput}
          contentHeight={contentHeight}
          scrollOffset={scrollOffset}
          setScrollOffset={setScrollOffset}
          onLinesChange={setTotalLines}
          showScrollbar={showScrollbar}
        />
      </Box>

      {/* 键入 / 后显示可选命令 */}
      {inputValue.startsWith('/') ? (
        <Box flexShrink={0} paddingLeft={2} paddingRight={2} paddingBottom={0}>
          <SlashSuggestions
            commands={commands}
            selectedIndex={slashSelectedIndex}
            filter={inputValue}
          />
        </Box>
      ) : null}

      {/* 输入行 */}
      <Box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={0} paddingBottom={0}>
        <Text color={theme.success}>{'> '}</Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          placeholder="Ask anything..."
        />
      </Box>

      {/* 底部状态栏 — 左：Secbot · mode · agent，右：快捷键 */}
      <Box
        flexShrink={0}
        flexDirection="row"
        justifyContent="space-between"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
      >
        <Text color={theme.textMuted}>
          Secbot · {mode} · {agent}
        </Text>
        <Text color={theme.textMuted}>
          tab agents · {keybind.print('command_list')} commands
        </Text>
      </Box>
    </Box>
  );
}
