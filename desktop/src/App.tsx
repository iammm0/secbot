import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BASE_URL } from "./config";
import type { RenderBlock, SSEEvent, SessionsResponse, SystemInfoResponse } from "./types";
import { useSSE } from "./useSSE";

const PHASE_LABELS: Record<string, string> = {
  idle: "空闲",
  planning: "规划中",
  thinking: "推理中",
  exec: "执行工具",
  report: "生成报告中",
  done: "完成",
};

let blockIdCounter = 0;
const nextBlockId = () =>
  `blk_${Date.now()}_${++blockIdCounter}_${Math.random().toString(36).slice(2, 9)}`;

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE_URL}${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}

function formatPayload(x: unknown, max = 4000): string {
  if (x === undefined || x === null) return "";
  if (typeof x === "string") return x.length > max ? `${x.slice(0, max)}…` : x;
  try {
    const s = JSON.stringify(x, null, 2);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(x);
  }
}

function BlockView({ block }: { block: RenderBlock }) {
  type B = RenderBlock["type"];
  const label: Record<B, string> = {
    user: "你",
    planning: "规划",
    task_phase: "阶段",
    thinking: "推理",
    execution: "工具",
    exec_result: "结果",
    observation: "内容",
    report: "报告",
    response: "回复",
    error: "错误",
  };
  const t = block.type;
  return (
    <div className={`block ${t}`}>
      <div className="block-label">
        {label[t]}
        {block.agent ? ` · ${block.agent}` : ""}
        {block.tool ? ` · ${block.tool}` : ""}
        {block.streaming ? " · …" : ""}
      </div>
      {t === "task_phase" && (
        <>
          {PHASE_LABELS[block.phase ?? "idle"] ?? block.phase}
          {block.detail ? ` — ${block.detail}` : ""}
        </>
      )}
      {t === "execution" && (
        <>
          {formatPayload(block.params)}
        </>
      )}
      {t === "exec_result" && (
        <>
          {block.success === false ? "失败\n" : "成功\n"}
          {block.error ? `${block.error}\n` : ""}
          {formatPayload(block.result)}
        </>
      )}
      {(t === "user" ||
        t === "thinking" ||
        t === "observation" ||
        t === "report" ||
        t === "response" ||
        t === "planning") &&
        (block.content ?? "")}
      {t === "error" && (block.error ?? "未知错误")}
    </div>
  );
}

export default function App() {
  const [blocks, setBlocks] = useState<RenderBlock[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"ask" | "agent">("agent");
  const [agentSubType, setAgentSubType] = useState<"hackbot" | "superhackbot">("hackbot");
  const [sessionNote, setSessionNote] = useState<string>("加载中…");
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [hostInfo, setHostInfo] = useState<string>("");

  const thinkingIdRef = useRef<string | null>(null);
  const thinkingContentRef = useRef("");
  const reportIdRef = useRef<string | null>(null);
  const reportContentRef = useRef("");
  const phaseIdRef = useRef<string | null>(null);
  const currentExecRef = useRef<{ id: string; tool: string } | null>(null);
  const blocksEndRef = useRef<HTMLDivElement>(null);

  const { streaming, startStream, stopStream } = useSSE();

  const scrollToEnd = useCallback(() => {
    setTimeout(() => blocksEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, []);

  const appendBlock = useCallback((block: RenderBlock) => {
    setBlocks((prev) => [...prev, block]);
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<RenderBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const setPhase = useCallback(
    (phase: RenderBlock["phase"], detail?: string) => {
      if (phaseIdRef.current) {
        updateBlock(phaseIdRef.current, { phase, detail });
      } else {
        const id = nextBlockId();
        phaseIdRef.current = id;
        appendBlock({
          id,
          type: "task_phase",
          timestamp: new Date(),
          phase,
          detail,
        });
      }
    },
    [appendBlock, updateBlock],
  );

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const info = await fetchJson<SystemInfoResponse>("/api/system/info");
        if (!cancelled) {
          setBackendOk(true);
          setHostInfo(`${info.hostname} · ${info.python_version}`);
        }
      } catch {
        if (!cancelled) {
          setBackendOk(false);
          setHostInfo("");
        }
      }
    };
    void tick();
    const id = setInterval(tick, backendOk ? 10000 : 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [backendOk]);

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchJson<SessionsResponse>("/api/sessions");
        setSessionNote(s.note ?? `共 ${s.sessions?.length ?? 0} 条会话记录`);
      } catch {
        setSessionNote("无法加载会话说明（后端未就绪）");
      }
    })();
  }, [backendOk]);

  const currentPhase = useMemo(() => {
    const last = [...blocks].reverse().find((b) => b.type === "task_phase");
    return (last as RenderBlock & { phase?: string })?.phase ?? "idle";
  }, [blocks]);

  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      const { event: eventType, data } = event;

      switch (eventType) {
        case "planning": {
          setPhase("planning");
          appendBlock({
            id: nextBlockId(),
            type: "planning",
            timestamp: new Date(),
            content: String(data.content ?? ""),
            agent: data.agent as string | undefined,
          });
          break;
        }
        case "thought_start": {
          setPhase("thinking");
          const id = nextBlockId();
          thinkingIdRef.current = id;
          thinkingContentRef.current = "";
          appendBlock({
            id,
            type: "thinking",
            timestamp: new Date(),
            iteration: Number(data.iteration ?? 1),
            content: "",
            streaming: true,
            agent: data.agent as string | undefined,
          });
          break;
        }
        case "thought_chunk": {
          const chunk = String(data.chunk ?? "");
          thinkingContentRef.current += chunk;
          if (thinkingIdRef.current) {
            updateBlock(thinkingIdRef.current, { content: thinkingContentRef.current });
          }
          break;
        }
        case "thought_end":
          break;
        case "thought": {
          const content = String(data.content ?? "");
          const iteration = Number(data.iteration ?? 1);
          if (thinkingIdRef.current) {
            updateBlock(thinkingIdRef.current, {
              content,
              streaming: false,
              iteration,
              agent: data.agent as string | undefined,
            });
          } else {
            appendBlock({
              id: nextBlockId(),
              type: "thinking",
              timestamp: new Date(),
              iteration,
              content,
              streaming: false,
              agent: data.agent as string | undefined,
            });
          }
          thinkingIdRef.current = null;
          thinkingContentRef.current = "";
          break;
        }
        case "action_start": {
          const tool = String(data.tool ?? "unknown");
          setPhase("exec", tool);
          const id = nextBlockId();
          currentExecRef.current = { id, tool };
          appendBlock({
            id,
            type: "execution",
            timestamp: new Date(),
            tool,
            params: (data.params as Record<string, unknown>) ?? {},
            streaming: true,
            agent: data.agent as string | undefined,
          });
          break;
        }
        case "action_result": {
          const tool = String(data.tool ?? "");
          const success = data.success !== false;
          if (currentExecRef.current?.tool === tool) {
            updateBlock(currentExecRef.current.id, {
              type: "exec_result",
              streaming: false,
              success,
              result: data.result,
              error: data.error as string | undefined,
              agent: data.agent as string | undefined,
            });
          } else {
            appendBlock({
              id: nextBlockId(),
              type: "exec_result",
              timestamp: new Date(),
              tool,
              success,
              result: data.result,
              error: data.error as string | undefined,
              agent: data.agent as string | undefined,
            });
          }
          currentExecRef.current = null;
          break;
        }
        case "observation":
        case "content": {
          appendBlock({
            id: nextBlockId(),
            type: "observation",
            timestamp: new Date(),
            content: String(data.content ?? ""),
            agent: data.agent as string | undefined,
          });
          break;
        }
        case "report": {
          setPhase("report");
          const reportContent = String(data.content ?? data.report ?? "");
          if (reportIdRef.current) {
            reportContentRef.current += reportContent;
            updateBlock(reportIdRef.current, {
              content: reportContentRef.current,
              streaming: false,
              agent: data.agent as string | undefined,
            });
          } else {
            const id = nextBlockId();
            reportIdRef.current = id;
            reportContentRef.current = reportContent;
            appendBlock({
              id,
              type: "report",
              timestamp: new Date(),
              content: reportContent,
              streaming: false,
              agent: data.agent as string | undefined,
            });
          }
          break;
        }
        case "response": {
          setPhase("done");
          appendBlock({
            id: nextBlockId(),
            type: "response",
            timestamp: new Date(),
            content: String(data.content ?? ""),
            agent: (data.agent as string) ?? (mode === "agent" ? agentSubType : mode),
          });
          break;
        }
        case "error": {
          setPhase("done", "出错结束");
          appendBlock({
            id: nextBlockId(),
            type: "error",
            timestamp: new Date(),
            error: String(data.error ?? "未知错误"),
          });
          break;
        }
        case "phase": {
          setPhase((data.phase as RenderBlock["phase"]) || "thinking", String(data.detail ?? ""));
          break;
        }
        case "connected": {
          setPhase("thinking", "已连接…");
          break;
        }
        case "root_required": {
          appendBlock({
            id: nextBlockId(),
            type: "observation",
            timestamp: new Date(),
            content: `需要提升权限执行：${String(data.command ?? "")}\n请在终端 TUI / 移动端完成 root 授权（桌面端未集成密码回传）。`,
          });
          break;
        }
        case "done": {
          setPhase("done");
          if (thinkingIdRef.current) {
            updateBlock(thinkingIdRef.current, { streaming: false });
          }
          if (reportIdRef.current) {
            updateBlock(reportIdRef.current, { streaming: false });
          }
          thinkingIdRef.current = null;
          thinkingContentRef.current = "";
          reportIdRef.current = null;
          reportContentRef.current = "";
          phaseIdRef.current = null;
          currentExecRef.current = null;
          break;
        }
        default:
          break;
      }
      scrollToEnd();
    },
    [mode, agentSubType, appendBlock, updateBlock, setPhase, scrollToEnd],
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    thinkingIdRef.current = null;
    thinkingContentRef.current = "";
    reportIdRef.current = null;
    reportContentRef.current = "";
    phaseIdRef.current = null;
    currentExecRef.current = null;

    appendBlock({
      id: nextBlockId(),
      type: "user",
      timestamp: new Date(),
      content: trimmed,
    });
    setInput("");
    scrollToEnd();
    setPhase("thinking", "连接中…");

    const body: Record<string, string> = {
      message: trimmed,
      mode,
      agent: mode === "agent" ? agentSubType : "hackbot",
    };

    startStream(
      "/api/chat",
      body,
      handleSSEEvent,
      () => scrollToEnd(),
      (error) => {
        if (phaseIdRef.current) {
          updateBlock(phaseIdRef.current, { phase: "done", detail: "出错结束" });
          phaseIdRef.current = null;
        }
        appendBlock({
          id: nextBlockId(),
          type: "error",
          timestamp: new Date(),
          error: `连接错误: ${error.message}`,
        });
        scrollToEnd();
      },
    );
  }, [
    input,
    mode,
    agentSubType,
    streaming,
    startStream,
    handleSSEEvent,
    appendBlock,
    updateBlock,
    setPhase,
    scrollToEnd,
  ]);

  const statusText = useMemo(() => {
    if (!streaming && currentPhase === "done") return "空闲";
    const label = PHASE_LABELS[currentPhase] ?? currentPhase;
    return streaming ? `流式中 · ${label}` : label;
  }, [streaming, currentPhase]);

  const backendPill =
    backendOk === null ? "wait" : backendOk ? "ok" : "err";
  const backendText =
    backendOk === null
      ? "检测后端…"
      : backendOk
        ? `后端已连接${hostInfo ? ` · ${hostInfo}` : ""}`
        : "后端未就绪（正在启动或端口占用）";

  return (
    <div className="app">
      <header className="topbar">
        <span className={`backend-pill ${backendPill}`}>{backendText}</span>
        <div className="mode-group">
          <button type="button" className={mode === "ask" ? "active" : ""} onClick={() => setMode("ask")}>
            Ask
          </button>
          <button type="button" className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}>
            Agent
          </button>
        </div>
        {mode === "agent" && (
          <div className="mode-group">
            <button
              type="button"
              className={agentSubType === "hackbot" ? "active" : ""}
              onClick={() => setAgentSubType("hackbot")}
            >
              自动
            </button>
            <button
              type="button"
              className={agentSubType === "superhackbot" ? "active" : ""}
              onClick={() => setAgentSubType("superhackbot")}
            >
              专家
            </button>
          </div>
        )}
        <span className="status-line">{statusText}</span>
      </header>
      <div className="main">
        <aside className="sidebar">
          <h3>会话</h3>
          <p>{sessionNote}</p>
        </aside>
        <div className="chat-col">
          <div className="blocks">
            {blocks.map((b) => (
              <BlockView key={b.id} block={b} />
            ))}
            <div ref={blocksEndRef} />
          </div>
          <div className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
            />
            {streaming ? (
              <button type="button" className="stop" onClick={() => stopStream()}>
                停止
              </button>
            ) : (
              <button type="button" onClick={() => handleSend()} disabled={!input.trim() || !backendOk}>
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
