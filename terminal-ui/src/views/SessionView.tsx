/**
 * 会话视图 — 主区 + 斜杠命令建议 + 输入 + 底部状态栏
 */
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { MainContent } from "../MainContent.js";
import { SlashSuggestions } from "../components/SlashSuggestions.js";
import { useMouseScroll } from "../hooks/useMouseScroll.js";
import { getMouseEmitter } from "../hooks/mouseFilter.js";
import { parseSlash, getAgentFromState } from "../slash.js";
import { isSimpleGreetingOrNonTask } from "../intent.js";
import {
  useSync,
  useLocal,
  useTheme,
  useKeybind,
  useCommand,
  useDialog,
  useToast,
  useExit,
} from "../contexts/index.js";
import type { ThemeColors } from "../contexts/index.js";
import { inkKeyToParsedKey, isInkEscape } from "../contexts/KeybindContext.js";
import { streamStateToBlocks } from "../contentBlocks.js";
import { ModelConfigDialog } from "../components/ModelConfigDialog.js";
import { RestResultDialog } from "../components/RestResultDialog.js";
import { RootPermissionDialog } from "../components/RootPermissionDialog.js";
import { LoadingBar } from "../components/LoadingBar.js";
import { SessionSelectDialog } from "../components/SessionSelectDialog.js";
import { useRoute } from "../contexts/RouteContext.js";

/** 底部状态栏：SECBOT 固定绿色，无定时器，避免全屏下周期性重绘底部区域 */
function SessionStatusBar({
  mode,
  agent,
  sessionLabel,
  theme,
}: {
  mode: string;
  agent: string;
  sessionLabel: string;
  theme: Pick<ThemeColors, "textMuted" | "success">;
}) {
  return (
    <Box
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      paddingTop={1}
      paddingBottom={0}
      paddingLeft={2}
      paddingRight={2}
    >
      <Text>
        <Text color={theme.success} bold>
          SECBOT
        </Text>
        <Text color={theme.textMuted}>
          {" "}
          · {sessionLabel} · {mode} · {agent}
        </Text>
      </Text>
    </Box>
  );
}

interface SessionViewProps {
  columns: number;
  rows: number;
  /** 从首页带过来的初始输入，进入会话时预填 */
  initialPrompt?: string;
}

export function SessionView({
  columns,
  rows,
  initialPrompt,
}: SessionViewProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [totalLines, setTotalLines] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [showScrollbar, setShowScrollbar] = useState(true);
  const { commands, register, trigger } = useCommand();
  const totalLinesRef = useRef(0);
  const scrollableHeightRef = useRef(1);
  // 使用 ref 确保初始 prompt 只处理一次，避免重复发送
  const hasAppliedInitialPromptRef = useRef(false);

  // ── 输入历史管理（类似终端命令历史） ────────────────────────────────────────
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  // -1 表示当前新输入，0..n 表示从最新到最旧的历史
  const [historyIndex, setHistoryIndex] = useState(-1);
  // 暂存用户正在编辑但尚未提交的输入，以便从历史导航返回时恢复
  const draftInputRef = useRef("");

  const theme = useTheme();
  const sync = useSync();
  const local = useLocal();
  const keybind = useKeybind();
  const dialog = useDialog();
  const toast = useToast();
  const exit = useExit();
  const { navigate } = useRoute();
  const {
    streaming,
    streamState,
    history,
    currentUserMessage,
    currentSentAt,
    currentCompletedAt,
    apiOutput,
    pendingRootRequest,
    setPendingRootRequest,
    sendMessage,
    setRESTOutput,
    sessionList,
    switchSession,
    newSession,
    currentRoundChatMode,
  } = sync;
  const { mode, agent, setMode, setAgent } = local;

  const activeSessionLabel = useMemo(() => {
    const hit = sessionList.find((s) => s.isActive);
    return hit?.label ?? "会话";
  }, [sessionList]);

  const blocks = useMemo(
    () =>
      streamStateToBlocks(
        streamState,
        streaming,
        apiOutput,
        undefined,
        currentSentAt > 0 ? currentSentAt : undefined,
        currentCompletedAt > 0 ? currentCompletedAt : undefined,
        currentRoundChatMode,
      ),
    [
      streamState,
      streaming,
      apiOutput,
      currentSentAt,
      currentCompletedAt,
      currentRoundChatMode,
    ],
  );

  const actionProgress = useMemo(() => {
    const total = streamState.actions.length;
    const completed = streamState.actions.filter((a) => a.result !== undefined).length;
    return { total, completed };
  }, [streamState.actions]);

  const slashSuggestions = useMemo(() => {
    if (!inputValue.startsWith("/")) return [];
    const f = inputValue.toLowerCase();
    return commands
      .filter((c) => c.slash && c.slash.toLowerCase().startsWith(f))
      .slice(0, 12);
  }, [commands, inputValue]);

  const contentHeight = useMemo(() => {
    // 固定区：分隔线/加载状态条(执行中)/输入行/状态栏/统计栏，再按斜杠建议条目动态预留高度，避免内容区和交互区重叠。
    const baseReserved = streaming ? 11 : 10;
    const slashReserved = inputValue.startsWith("/")
      ? Math.min(12, slashSuggestions.length) + 2
      : 0;
    return Math.max(6, rows - baseReserved - slashReserved);
  }, [rows, streaming, inputValue, slashSuggestions.length]);

  const scrollableHeight = Math.max(1, contentHeight);
  const maxScroll = Math.max(0, totalLines - scrollableHeight);

  // ── 鼠标滚轮滚动对话记录 ──────────────────────────────────────────────
  const mouseEmitter = useMemo(() => getMouseEmitter(), []);
  const handleScrollUp = useCallback(
    (lines: number) => setScrollOffset((s) => Math.max(0, s - lines)),
    [],
  );
  const handleScrollDown = useCallback(
    (lines: number) =>
      setScrollOffset((s) =>
        Math.min(Math.max(0, totalLinesRef.current - scrollableHeightRef.current), s + lines),
      ),
    [],
  );
  useMouseScroll({
    emitter: mouseEmitter,
    enabled: dialog.stack.length === 0,
    scrollStep: 3,
    onScrollUp: handleScrollUp,
    onScrollDown: handleScrollDown,
  });

  useEffect(() => {
    totalLinesRef.current = totalLines;
    scrollableHeightRef.current = scrollableHeight;
  }, [totalLines, scrollableHeight]);

  useEffect(() => {
    setScrollOffset((s) => Math.min(s, maxScroll));
  }, [maxScroll]);

  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [inputValue]);

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
      () => setPendingRootRequest(null),
    );
  }, [pendingRootRequest]);

  const findNextBlockOffset = useCallback(
    (direction: "next" | "prev"): number | null => {
      if (blocks.length === 0) return null;
      if (direction === "next") {
        const next = blocks.find(
          (b) => b.lineStart >= scrollOffset + scrollableHeight,
        );
        return next ? next.lineStart : null;
      }
      const prev = [...blocks].reverse().find((b) => b.lineEnd <= scrollOffset);
      return prev ? prev.lineStart : null;
    },
    [blocks, scrollOffset, scrollableHeight],
  );

  const scrollToNextBlock = useCallback(
    (direction: "next" | "prev") => {
      const offset = findNextBlockOffset(direction);
      if (offset !== null) {
        setScrollOffset(Math.min(maxScroll, Math.max(0, offset)));
        return;
      }
      const half = Math.max(1, Math.floor(scrollableHeight / 2));
      if (direction === "next")
        setScrollOffset((s) => Math.min(maxScroll, s + half));
      else setScrollOffset((s) => Math.max(0, s - half));
    },
    [findNextBlockOffset, maxScroll, scrollableHeight],
  );

  const toBottom = useCallback(() => {
    setTimeout(() => {
      setScrollOffset(
        Math.max(0, totalLinesRef.current - scrollableHeightRef.current),
      );
    }, 50);
  }, []);

  useEffect(() => {
    const unregs = [
      register({
        title: "切换消息区滚动条",
        value: "session.toggle.scrollbar",
        category: "会话",
        onSelect: ({ close }) => {
          setShowScrollbar((v) => !v);
          close();
        },
      }),
      register({
        title: "首条消息",
        value: "session.first",
        category: "会话",
        keybind: "messages_first",
        onSelect: ({ close }) => {
          setScrollOffset(0);
          close();
        },
      }),
      register({
        title: "末条消息",
        value: "session.last",
        category: "会话",
        keybind: "messages_last",
        onSelect: ({ close }) => {
          setScrollOffset(maxScroll);
          close();
        },
      }),
      register({
        title: "半页上",
        value: "session.half.page.up",
        category: "会话",
        keybind: "messages_half_page_up",
        onSelect: ({ close }) => {
          setScrollOffset((s) =>
            Math.max(0, s - Math.max(1, Math.floor(scrollableHeight / 2))),
          );
          close();
        },
      }),
      register({
        title: "半页下",
        value: "session.half.page.down",
        category: "会话",
        keybind: "messages_half_page_down",
        onSelect: ({ close }) => {
          setScrollOffset((s) =>
            Math.min(
              maxScroll,
              s + Math.max(1, Math.floor(scrollableHeight / 2)),
            ),
          );
          close();
        },
      }),
      register({
        title: "上一条消息",
        value: "session.message.previous",
        category: "会话",
        keybind: "messages_previous",
        onSelect: ({ close }) => {
          scrollToNextBlock("prev");
          close();
        },
      }),
      register({
        title: "下一条消息",
        value: "session.message.next",
        category: "会话",
        keybind: "messages_next",
        onSelect: ({ close }) => {
          scrollToNextBlock("next");
          close();
        },
      }),
      register({
        title: "新建空白会话",
        value: "/new-session",
        category: "会话",
        slash: "/new-session",
        onSelect: ({ close }) => {
          newSession();
          toast.show({ message: "已新建空白会话", variant: "success" });
          close();
        },
      }),
      register({
        title: "切换会话",
        value: "/sessions",
        category: "会话",
        slash: "/sessions",
        onSelect: ({ close }) => {
          close();
          dialog.replace(
            <SessionSelectDialog
              sessions={sessionList}
              onSelect={(id) => switchSession(id)}
            />,
          );
        },
      }),
    ];
    return () => unregs.forEach((u) => u());
  }, [
    register,
    maxScroll,
    scrollableHeight,
    scrollToNextBlock,
    newSession,
    switchSession,
    sessionList,
    dialog,
    toast,
  ]);

  useInput((input, key) => {
    const evt = inkKeyToParsedKey(input, key);
    if (keybind.match("agent_switch", evt)) {
      trigger("/agent");
      return;
    }
    if (keybind.match("page_up", evt)) {
      setScrollOffset((s) => Math.max(0, s - contentHeight));
      return;
    }
    if (keybind.match("page_down", evt)) {
      setScrollOffset((s) => Math.min(maxScroll, s + contentHeight));
      return;
    }
    if (keybind.match("messages_first", evt)) {
      setScrollOffset(0);
      return;
    }
    if (keybind.match("messages_last", evt)) {
      setScrollOffset(maxScroll);
      return;
    }
    if (keybind.match("messages_half_page_up", evt)) {
      setScrollOffset((s) =>
        Math.max(0, s - Math.max(1, Math.floor(scrollableHeight / 2))),
      );
      return;
    }
    if (keybind.match("messages_half_page_down", evt)) {
      setScrollOffset((s) =>
        Math.min(maxScroll, s + Math.max(1, Math.floor(scrollableHeight / 2))),
      );
      return;
    }
    if (keybind.match("messages_previous", evt)) {
      scrollToNextBlock("prev");
      return;
    }
    if (keybind.match("messages_next", evt)) {
      scrollToNextBlock("next");
      return;
    }
    if (slashSuggestions.length > 0) {
      if (key.upArrow) {
        setSlashSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSlashSelectedIndex((i) =>
          Math.min(slashSuggestions.length - 1, i + 1),
        );
        return;
      }
      if (key.return && slashSuggestions.length > 0) return;
      if (isInkEscape(input, key)) {
        setInputValue("");
        return;
      }
    } else {
      // 上下箭头用于切换输入历史（类似终端命令历史）
      if (key.upArrow) {
        if (inputHistory.length > 0) {
          if (historyIndex === -1) {
            // 首次按上箭头，暂存当前输入
            draftInputRef.current = inputValue;
          }
          const nextIdx = Math.min(historyIndex + 1, inputHistory.length - 1);
          setHistoryIndex(nextIdx);
          setInputValue(inputHistory[inputHistory.length - 1 - nextIdx]);
        }
        return;
      }
      if (key.downArrow) {
        if (historyIndex > 0) {
          const nextIdx = historyIndex - 1;
          setHistoryIndex(nextIdx);
          setInputValue(inputHistory[inputHistory.length - 1 - nextIdx]);
        } else if (historyIndex === 0) {
          // 回到最新，恢复用户之前正在编辑的内容
          setHistoryIndex(-1);
          setInputValue(draftInputRef.current);
        }
        return;
      }
    }
  });

  const handleSubmit = useCallback(
    (valueOr?: string) => {
      const trimmed = (valueOr ?? inputValue).trim();
      if (!trimmed) return;

      // 记录输入历史（类似终端命令历史，所有提交均记录）
      setInputHistory((prev) => [...prev, trimmed]);
      setHistoryIndex(-1);
      draftInputRef.current = "";

      if (
        trimmed.toLowerCase() === "exit" ||
        trimmed.toLowerCase() === "quit"
      ) {
        setInputValue("");
        exit(0);
        return;
      }

      if (trimmed.startsWith("/")) {
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0]?.toLowerCase();
        const exact = commands.find(
          (c) => c.slash && c.slash.toLowerCase() === cmd,
        );
        const chatOnlySlash = ["/ask", "/task"];
        const restSlashUseParseSlash = ["/help", "/list-agents", "/tools"];
        if (
          exact &&
          !chatOnlySlash.includes(cmd) &&
          (cmd !== "/agent" || parts.length <= 1) &&
          !restSlashUseParseSlash.includes(cmd)
        ) {
          trigger(exact.value);
          setInputValue("");
          return;
        }

        const result = parseSlash(trimmed, { mode, agent });
        if (result.handled) {
          setAgent(getAgentFromState(trimmed, agent));
          if (result.chat && result.chat.message) {
            setMode(result.chat.mode);
            sendMessage(
              result.chat.message,
              result.chat.mode,
              result.chat.agent,
            );
            setInputValue("");
            toBottom();
            return;
          }
          if (result.chat && !result.chat.message) {
            setMode(result.chat.mode);
            const modeLabels: Record<string, string> = {
              ask: "问答",
              agent: "执行",
            };
            toast.show({
              message: `已切换到${modeLabels[result.chat.mode] ?? result.chat.mode}模式`,
              variant: "success",
            });
            setInputValue("");
            return;
          }
          if (result.fetchThen) {
            if (cmd === "/model") {
              dialog.replace(<ModelConfigDialog />);
              setInputValue("");
              return;
            }
            const restTitles: Record<string, string> = {
              "/help": "SECBOT 帮助",
              "/list-agents": "智能体列表",
              "/tools": "SECBOT 内置工具",
            };
            const title = restTitles[cmd] ?? "API 结果";
            dialog.replace(
              <RestResultDialog
                title={title}
                fetchContent={result.fetchThen}
              />,
            );
            setInputValue("");
            return;
          }
          setInputValue("");
          return;
        }
        // 以 / 开头但未匹配到命令：不触发推理，仅清空或提示
        setInputValue("");
        toast.show({
          message: "未知斜杠命令，输入 / 可查看列表",
          variant: "info",
        });
        return;
      }

      const effectiveMode = isSimpleGreetingOrNonTask(trimmed) ? "ask" : mode;
      sendMessage(trimmed, effectiveMode, agent);
      setInputValue("");
      toBottom();
    },
    [
      mode,
      agent,
      sendMessage,
      setRESTOutput,
      setMode,
      setAgent,
      inputValue,
      toBottom,
      dialog,
      toast,
      exit,
      commands,
      trigger,
    ],
  );

  // 进入会话时若有初始消息，立即发送，无需用户再回车
  useEffect(() => {
    if (initialPrompt?.trim() && !hasAppliedInitialPromptRef.current) {
      hasAppliedInitialPromptRef.current = true;
      // 清除路由中的 initialPrompt，防止返回首页再进入时会话时重复触发
      navigate({ type: 'session' });
      handleSubmit(initialPrompt.trim());
    }
  }, [initialPrompt, handleSubmit, navigate]);

  return (
    <Box flexDirection="column" flexGrow={1} minHeight={0}>
      {/* 主对话区 — 单栏、无边框、块间距 */}
      <Box
        flexDirection="column"
        flexGrow={1}
        minWidth={0}
        paddingLeft={2}
        paddingRight={2}
      >
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
          currentUserMessage={currentUserMessage}
          currentSentAt={currentSentAt}
          currentCompletedAt={currentCompletedAt}
          currentRoundChatMode={currentRoundChatMode}
        />
      </Box>

      {/* 交互区与内容区之间的可视分隔线 */}
      <Box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={1}>
        <Text color={theme.border}>{"━".repeat(Math.max(0, columns - 6))}</Text>
      </Box>

      {/* 执行状态条：实时显示当前阶段与工具执行进度 */}
      <LoadingBar
        active={streaming}
        phase={streamState.phase}
        detail={streamState.detail}
        actionTotal={actionProgress.total}
        actionCompleted={actionProgress.completed}
      />

      {/* 键入 / 后显示可选命令 */}
      {inputValue.startsWith("/") ? (
        <Box flexShrink={0} paddingLeft={2} paddingRight={2} paddingBottom={0}>
          <SlashSuggestions
            commands={commands}
            selectedIndex={slashSelectedIndex}
            filter={inputValue}
          />
        </Box>
      ) : null}

      {/* 输入行 */}
      <Box
        flexShrink={0}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={0}
        paddingBottom={0}
      >
        <Text color={theme.success}>{"> "}</Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={() => {
            if (slashSuggestions.length > 0) {
              const sel =
                slashSuggestions[
                  Math.min(slashSelectedIndex, slashSuggestions.length - 1)
                ];
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

      {/* 底部状态栏 — SECBOT（固定绿色）· mode · agent */}
      <SessionStatusBar
        mode={mode}
        agent={agent}
        sessionLabel={activeSessionLabel}
        theme={theme}
      />

      {/* 统计与快捷键 — 置于最底部 */}
      <Box
        flexShrink={0}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={0}
        paddingBottom={1}
      >
        <Text color={theme.textMuted}>
          {totalLines > 0
            ? ` ${Math.min(scrollOffset + 1, totalLines)}-${Math.min(scrollOffset + scrollableHeight, totalLines)}/${totalLines} 行 `
            : " "}
          {" \u2191/\u2193\u5386\u53f2 \u6eda\u8f6e\u6eda\u52a8 "}{keybind.print("page_up")}/{keybind.print("page_down")}{"\u7ffb\u9875"}
          {scrollOffset <= 0 ? "" : " ↑"}
          {totalLines <= scrollableHeight ||
          scrollOffset >= totalLines - scrollableHeight
            ? ""
            : " ↓"}
        </Text>
      </Box>
    </Box>
  );
}
