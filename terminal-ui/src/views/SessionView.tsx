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
import { useSync, useLocal, useTheme, useKeybind, useCommand, useDialog, useToast, useExit } from '../contexts/index.js';
import { inkKeyToParsedKey } from '../contexts/KeybindContext.js';
import { streamStateToBlocks } from '../contentBlocks.js';
import { ModelConfigDialog } from '../components/ModelConfigDialog.js';
import { RestResultDialog } from '../components/RestResultDialog.js';
import { RootPermissionDialog } from '../components/RootPermissionDialog.js';
import { LoadingBar } from '../components/LoadingBar.js';

const CONTENT_HEIGHT_OFFSET = 9;
/** 彩虹流动动效间隔（与 HomeView 一致） */
const RAINBOW_PHASE_MS = 180;

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
  const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(new Set());
  /** 彩虹流动动效相位（底部 Secbot 标识） */
  const [rainbowPhase, setRainbowPhase] = useState(0);
  const { commands, register, trigger } = useCommand();
  const totalLinesRef = useRef(0);
  const scrollableHeightRef = useRef(1);

  const theme = useTheme();
  const sync = useSync();
  const local = useLocal();
  const keybind = useKeybind();
  const dialog = useDialog();
  const toast = useToast();
  const exit = useExit();
  const {
    streaming,
    streamState,
    history,
    apiOutput,
    pendingRootRequest,
    setPendingRootRequest,
    sendMessage,
    setRESTOutput,
  } = sync;
  const { mode, agent, setMode, setAgent } = local;

  const contentHeight = useMemo(() => Math.max(8, rows - CONTENT_HEIGHT_OFFSET), [rows]);
  const scrollableHeight = Math.max(1, contentHeight);
  const maxScroll = Math.max(0, totalLines - scrollableHeight);

  const collapsibleOrder = useMemo(() => {
    const ids: string[] = [];
    if (apiOutput != null) ids.push('api');
    if (streamState.content) ids.push('content');
    if (streamState.report) ids.push('report');
    if (streamState.response) ids.push('response');
    return ids;
  }, [apiOutput, streamState.content, streamState.report, streamState.response]);

  const blocks = useMemo(
    () => streamStateToBlocks(streamState, streaming, apiOutput, undefined, expandedBlockIds),
    [streamState, streaming, apiOutput, expandedBlockIds]
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

  useEffect(() => {
    const id = setInterval(() => setRainbowPhase((p) => p + 1), RAINBOW_PHASE_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pendingRootRequest) return;
    dialog.replace(
      <RootPermissionDialog
        requestId={pendingRootRequest.requestId}
        command={pendingRootRequest.command}
        onResolve={() => {
          setPendingRootRequest(null);
          dialog.pop();
        }}
      />,
      () => setPendingRootRequest(null)
    );
  }, [pendingRootRequest]);

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

  useInput((input, key) => {
    const evt = inkKeyToParsedKey(input, key);
    if (keybind.match('agent_switch', evt)) {
      trigger('/agent');
      return;
    }
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
    if (keybind.match('expand_block', evt)) {
      const first = collapsibleOrder.find((id) => !expandedBlockIds.has(id));
      if (first) setExpandedBlockIds((prev) => new Set([...prev, first]));
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
      if (key.return && slashSuggestions.length > 0) return;
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

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        setInputValue('');
        exit(0);
        return;
      }

      if (trimmed.startsWith('/')) {
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0]?.toLowerCase();
        const exact = commands.find((c) => c.slash && c.slash.toLowerCase() === cmd);
        const chatOnlySlash = ['/ask', '/task'];
        const restSlashUseParseSlash = ['/help', '/list-agents', '/tools'];
        if (
          exact &&
          !chatOnlySlash.includes(cmd) &&
          (cmd !== '/agent' || parts.length <= 1) &&
          !restSlashUseParseSlash.includes(cmd)
        ) {
          trigger(exact.value);
          setInputValue('');
          return;
        }

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
            const modeLabels: Record<string, string> = { ask: '问答', agent: '执行' };
            toast.show({ message: `已切换到${modeLabels[result.chat.mode] ?? result.chat.mode}模式`, variant: 'success' });
            setInputValue('');
            return;
          }
          if (result.fetchThen) {
            if (cmd === '/model') {
              dialog.replace(<ModelConfigDialog />);
              setInputValue('');
              return;
            }
            const restTitles: Record<string, string> = {
              '/help': 'SECBOT 帮助',
              '/list-agents': '智能体列表',
              '/tools': 'SECBOT 内置工具',
            };
            const title = restTitles[cmd] ?? 'API 结果';
            dialog.replace(<RestResultDialog title={title} fetchContent={result.fetchThen} />);
            setInputValue('');
            return;
          }
          setInputValue('');
          return;
        }
        // 以 / 开头但未匹配到命令：不触发推理，仅清空或提示
        setInputValue('');
        toast.show({ message: '未知斜杠命令，输入 / 可查看列表', variant: 'info' });
        return;
      }

      const effectiveMode = isSimpleGreetingOrNonTask(trimmed) ? 'ask' : mode;
      sendMessage(trimmed, effectiveMode, agent);
      setInputValue('');
      toBottom();
    },
    [mode, agent, sendMessage, setRESTOutput, setMode, setAgent, inputValue, toBottom, dialog, toast, exit, commands, trigger]
  );

  // 进入会话时若有初始消息，立即发送，无需用户再回车
  useEffect(() => {
    if (initialPrompt?.trim() && !hasAppliedInitialPrompt) {
      setHasAppliedInitialPrompt(true);
      handleSubmit(initialPrompt.trim());
    }
  }, [initialPrompt, hasAppliedInitialPrompt, handleSubmit]);

  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      {/* 主对话区 — 单栏、无边框、块间距 */}
      <Box flexDirection="column" flexGrow={1} minWidth={0} paddingLeft={2} paddingRight={2}>
        <MainContent
          history={history}
          streamState={streamState}
          streaming={streaming}
          apiOutput={apiOutput}
          contentHeight={contentHeight}
          scrollOffset={scrollOffset}
          setScrollOffset={setScrollOffset}
          onLinesChange={setTotalLines}
          showScrollbar={showScrollbar}
          expandedBlockIds={expandedBlockIds}
        />
      </Box>

      {/* 交互区与内容区之间的可视分隔线 */}
      <Box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={1}>
        <Text color={theme.border}>{'━'.repeat(Math.max(0, columns - 6))}</Text>
      </Box>

      {/* 执行中加载条（根据需求已移除进度条展示，仅保留底部状态栏模式指示） */}

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
          onSubmit={() => {
            if (slashSuggestions.length > 0) {
              const sel = slashSuggestions[Math.min(slashSelectedIndex, slashSuggestions.length - 1)];
              if (sel) {
                setInputValue(sel.slash ?? sel.value);
                handleSubmit(sel.value);
                return;
              }
            }
            handleSubmit();
          }}
          placeholder="Ask anything..."
        />
      </Box>

      {/* 底部状态栏 — SECBOT 赛博朋克七彩 · mode · agent */}
      <Box
        flexShrink={0}
        flexDirection="row"
        justifyContent="space-between"
        paddingTop={1}
        paddingBottom={0}
        paddingLeft={2}
        paddingRight={2}
      >
        <Text color={theme.textMuted}>
          {'SECBOT'.split('').map((char, i) => (
            <Text key={i} color={theme.cyberRainbow[(i + rainbowPhase) % theme.cyberRainbow.length]} bold>
              {char}
            </Text>
          ))}
          <Text color={theme.textMuted}> · {mode} · {agent}</Text>
        </Text>
      </Box>

      {/* 统计与快捷键 — 置于最底部 */}
      <Box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={0} paddingBottom={1}>
        <Text color={theme.textMuted}>
          {totalLines > 0
            ? ` ${Math.min(scrollOffset + 1, totalLines)}-${Math.min(scrollOffset + scrollableHeight, totalLines)}/${totalLines} 行 `
            : ' '}
          ↑/↓ {keybind.print('page_up')}/{keybind.print('page_down')} Home/End 首/尾 {keybind.print('expand_block')} 展开
          {scrollOffset <= 0 ? '' : ' ↑'}
          {totalLines <= scrollableHeight || scrollOffset >= totalLines - scrollableHeight ? '' : ' ↓'}
        </Text>
      </Box>
    </Box>
  );
}
