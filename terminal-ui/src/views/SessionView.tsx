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
import { inkKeyToParsedKey } from "../contexts/KeybindContext.js";
import { streamStateToBlocks } from "../contentBlocks.js";
import { ModelConfigDialog } from "../components/ModelConfigDialog.js";
import { RestResultDialog } from "../components/RestResultDialog.js";
import { RootPermissionDialog } from "../components/RootPermissionDialog.js";
import { LoadingBar } from "../components/LoadingBar.js";

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  ask: { label: "问答", color: "cyan" },
  plan: { label: "规划", color: "yellow" },
  agent: { label: "执行", color: "green" },
};

/** 底部状态栏：SECBOT 固定绿色，无定时器，避免全屏下周期性重绘底部区域 */
function SessionStatusBar({
  mode,
  agent,
  theme,
}: {
  mode: string;
  agent: string;
  theme: { textMuted: string; success: string };
}) {
  const modeInfo = MODE_LABELS[mode] ?? { label: mode, color: theme.textMuted };
  return (
    <Box flexShrink={0} flexDirection="row" justifyContent="space-between">
      <Text>
        <Text color={theme.success} bold>
          SECBOT
        </Text>
        <Text color={theme.textMuted}> · </Text>
        <Text color={modeInfo.color} bold>{modeInfo.label}</Text>
        <Text color={theme.textMuted}> · {agent}</Text>
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
  const PANEL_BASE_LINES = 5; // 分隔线/状态条/输入行/状态栏/统计栏
  const [scrollOffset, setScrollOffset] = useState(0);
  const [totalLines, setTotalLines] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [hasAppliedInitialPrompt, setHasAppliedInitialPrompt] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [showScrollbar, setShowScrollbar] = useState(true);
  const pendingPlanPromptRef = useRef<string>("");
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
    currentUserMessage,
    currentSentAt,
    currentCompletedAt,
    apiOutput,
    pendingRootRequest,
    setPendingRootRequest,
    sendMessage,
    setRESTOutput,
  } = sync;
  const { mode, agent, setMode, setAgent } = local;

  const blocks = useMemo(
    () =>
      streamStateToBlocks(
        streamState,
        streaming,
        apiOutput,
        undefined,
        currentSentAt > 0 ? currentSentAt : undefined,
        currentCompletedAt > 0 ? currentCompletedAt : undefined,
      ),
    [
      streamState,
      streaming,
      apiOutput,
      currentSentAt,
      currentCompletedAt,
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
    // 底部面板固定占位，避免推理/执行块进入输入区
    const slashReserved = inputValue.startsWith("/")
      ? Math.min(12, slashSuggestions.length)
      : 0;
    const panelHeight = PANEL_BASE_LINES + slashReserved;
    return Math.max(6, rows - panelHeight);
  }, [rows, inputValue, slashSuggestions.length]);

  const scrollableHeight = Math.max(1, contentHeight);
  const maxScroll = Math.max(0, totalLines - scrollableHeight);

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
    ];
    return () => unregs.forEach((u) => u());
  }, [register, maxScroll, scrollableHeight, scrollToNextBlock]);

  useInput((input, key) => {
    const evt = inkKeyToParsedKey(input, key);
    if (keybind.match("agent_switch", evt)) {
      trigger("/task");
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
      if (key.escape) {
        setInputValue("");
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
        const chatOnlySlash = ["/ask", "/plan", "/task", "/agent", "/accept", "/reject"];
        const restSlashUseParseSlash = [
          "/help",
          "/tools",
          "/mode",
          "/opencode",
          "/acp-status",
          "/mcp-status",
          "/mcp-add",
          "/skills",
          "/permissions",
        ];
        if (
          exact &&
          !chatOnlySlash.includes(cmd) &&
          !restSlashUseParseSlash.includes(cmd)
        ) {
          trigger(exact.value);
          setInputValue("");
          return;
        }

        // ClaudeCode/OpenCode 风格：先 /plan，再 /accept 或 /reject
        if (cmd === "/accept") {
          const planned = pendingPlanPromptRef.current.trim();
          if (!planned) {
            toast.show({
              message: "没有可采纳的计划，请先用 /plan 生成任务计划",
              variant: "info",
            });
            setInputValue("");
            return;
          }
          setMode("agent");
          sendMessage(planned, "agent", "secbot-cli");
          pendingPlanPromptRef.current = "";
          toast.show({
            message: "已采纳计划，开始执行",
            variant: "success",
          });
          setInputValue("");
          toBottom();
          return;
        }
        if (cmd === "/reject") {
          pendingPlanPromptRef.current = "";
          toast.show({
            message: "已丢弃上一份计划",
            variant: "success",
          });
          setInputValue("");
          return;
        }

        const result = parseSlash(trimmed, { mode, agent });
        if (result.handled) {
          setAgent(getAgentFromState(trimmed, agent));
          if (result.chat && result.chat.message) {
            setMode(result.chat.mode);
            if (result.chat.mode === "plan") {
              pendingPlanPromptRef.current = result.chat.message;
            } else if (result.chat.mode === "agent") {
              pendingPlanPromptRef.current = "";
            }
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
            if (result.chat.mode === "agent") {
              pendingPlanPromptRef.current = "";
            }
            const modeLabels: Record<string, string> = {
              ask: "问答",
              plan: "规划",
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
              "/tools": "SECBOT 内置工具",
              "/mode": "模式说明",
              "/opencode": "SECBOT 兼容能力",
              "/acp-status": "ACP 网关能力",
              "/mcp-status": "MCP 服务状态",
              "/mcp-add": "MCP 服务接入",
              "/skills": "统一技能列表",
              "/permissions": "权限策略状态",
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
    if (initialPrompt?.trim() && !hasAppliedInitialPrompt) {
      setHasAppliedInitialPrompt(true);
      handleSubmit(initialPrompt.trim());
    }
  }, [initialPrompt, hasAppliedInitialPrompt, handleSubmit]);

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
        />
      </Box>

      {/* 底部控制+输入面板（非透明，且主内容区不可进入） */}
      <Box
        flexShrink={0}
        flexDirection="column"
        paddingLeft={2}
        paddingRight={2}
      >
        <Text color={theme.border}>{"━".repeat(Math.max(0, columns - 6))}</Text>

        {streaming ? (
          <LoadingBar
            active={streaming}
            phase={streamState.phase}
            detail={streamState.detail}
            actionTotal={actionProgress.total}
            actionCompleted={actionProgress.completed}
          />
        ) : (
          <Box>
            <Text color={theme.textMuted}>[IDLE]</Text>
          </Box>
        )}

        {inputValue.startsWith("/") ? (
          <SlashSuggestions
            commands={commands}
            selectedIndex={slashSelectedIndex}
            filter={inputValue}
          />
        ) : null}

        <Box>
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

        <SessionStatusBar mode={mode} agent={agent} theme={theme} />

        <Box>
          <Text color={theme.textMuted}>
            {totalLines > 0
              ? ` ${Math.min(scrollOffset + 1, totalLines)}-${Math.min(scrollOffset + scrollableHeight, totalLines)}/${totalLines} 行 `
              : " "}
            ↑/↓ {keybind.print("page_up")}/{keybind.print("page_down")} Home/End
            {scrollOffset <= 0 ? "" : " ↑"}
            {totalLines <= scrollableHeight ||
            scrollOffset >= totalLines - scrollableHeight
              ? ""
              : " ↓"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
