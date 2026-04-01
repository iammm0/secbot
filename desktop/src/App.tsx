import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BASE_URL } from "./config";
import {
  type AgentListResponse,
  type RenderBlock,
  type RootAction,
  type SSEEvent,
  type SessionsResponse,
  type SystemConfigResponse,
  type SystemInfoResponse,
  type ToolsResponse,
} from "./types";
import { useSSE } from "./useSSE";
import { CommandPalette, type CommandOption } from "./components/CommandPalette";
import { RootPermissionModal } from "./components/RootPermissionModal";
import { WorkbenchInspector } from "./components/WorkbenchInspector";

const PHASE_LABELS: Record<string, string> = {
  idle: "空闲",
  planning: "规划中",
  thinking: "推理中",
  exec: "执行工具",
  report: "生成报告中",
  done: "完成",
};

type SidebarPane = "overview" | "tools" | "agents" | "system";
type AgentMode = "secbot-cli" | "superhackbot";

interface RootPromptState {
  requestId: string;
  command: string;
}

const SIDEBAR_PANES: Array<{
  id: SidebarPane;
  label: string;
  hint: string;
}> = [
  { id: "overview", label: "任务台", hint: "会话与快捷任务" },
  { id: "tools", label: "工具", hint: "能力概览与分类" },
  { id: "agents", label: "智能体", hint: "角色与记忆操作" },
  { id: "system", label: "系统", hint: "连接、模型与配置" },
];

const QUICK_PROMPTS = [
  { label: "内网发现", prompt: "扫描当前局域网并列出在线主机与开放端口。" },
  { label: "防御扫描", prompt: "执行一次完整安全扫描，并总结关键风险。" },
  { label: "系统体检", prompt: "检查当前系统状态，并列出值得关注的异常指标。" },
  { label: "工具盘点", prompt: "列出当前可用的安全工具分类，并给出适用场景。" },
];

let blockIdCounter = 0;
const nextBlockId = () =>
  `blk_${Date.now()}_${++blockIdCounter}_${Math.random().toString(36).slice(2, 9)}`;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 200) || `${path} ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function formatPayload(value: unknown, max = 4000): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}…` : value;
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > max ? `${serialized.slice(0, max)}…` : serialized;
  } catch {
    return String(value);
  }
}

function formatToolsSummary(tools: ToolsResponse | null): string {
  if (!tools) return "工具列表尚未加载。";
  const lines = [
    `总计 ${tools.total} 个工具（基础 ${tools.basic_count} / 高级 ${tools.advanced_count}）`,
    "",
  ];
  for (const category of tools.categories.slice(0, 8)) {
    lines.push(`【${category.name}】${category.count} 个`);
    for (const tool of category.tools.slice(0, 4)) {
      lines.push(`- ${tool.name}: ${tool.description}`);
    }
    if (category.tools.length > 4) {
      lines.push(`- … 还有 ${category.tools.length - 4} 个`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function formatAgentsSummary(agents: AgentListResponse | null): string {
  if (!agents) return "智能体列表尚未加载。";
  return agents.agents
    .map((agent) => `${agent.name} (${agent.type})\n${agent.description}`)
    .join("\n\n");
}

function formatSystemSummary(config: SystemConfigResponse | null): string {
  if (!config) return "系统配置尚未加载。";
  return [
    `当前后端: ${config.llm_provider}`,
    `当前模型: ${config.current_provider_model ?? "未提供"}`,
    `当前 Base URL: ${config.current_provider_base_url ?? "未提供"}`,
    `Ollama 默认模型: ${config.ollama_model}`,
    `Ollama 服务地址: ${config.ollama_base_url}`,
  ].join("\n");
}

function BlockView({ block }: { block: RenderBlock }) {
  type BlockType = RenderBlock["type"];
  const label: Record<BlockType, string> = {
    user: "你",
    planning: "规划",
    task_phase: "阶段",
    thinking: "推理",
    execution: "工具",
    exec_result: "结果",
    observation: "观察",
    report: "报告",
    response: "回复",
    error: "错误",
  };
  const type = block.type;

  return (
    <section className={`block ${type}`}>
      <div className="block-header">
        <div className="block-label">
          {label[type]}
          {block.agent ? ` · ${block.agent}` : ""}
          {block.tool ? ` · ${block.tool}` : ""}
        </div>
        {block.streaming ? <span className="block-badge">streaming</span> : null}
      </div>

      {type === "task_phase" ? (
        <div className="block-content">
          {PHASE_LABELS[block.phase ?? "idle"] ?? block.phase}
          {block.detail ? ` — ${block.detail}` : ""}
        </div>
      ) : null}

      {type === "execution" ? (
        <pre className="block-content code">{formatPayload(block.params)}</pre>
      ) : null}

      {type === "exec_result" ? (
        <pre className="block-content code">
          {block.success === false ? "失败\n" : "成功\n"}
          {block.error ? `${block.error}\n` : ""}
          {formatPayload(block.result)}
        </pre>
      ) : null}

      {(type === "user" ||
        type === "thinking" ||
        type === "observation" ||
        type === "report" ||
        type === "response" ||
        type === "planning") && <div className="block-content">{block.content ?? ""}</div>}

      {type === "error" ? <div className="block-content error-text">{block.error ?? "未知错误"}</div> : null}
    </section>
  );
}

export default function App() {
  const [blocks, setBlocks] = useState<RenderBlock[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"ask" | "agent">("agent");
  const [agentSubType, setAgentSubType] = useState<AgentMode>("secbot-cli");
  const [sessionNote, setSessionNote] = useState("加载中…");
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [hostInfo, setHostInfo] = useState("");
  const [tools, setTools] = useState<ToolsResponse | null>(null);
  const [agents, setAgents] = useState<AgentListResponse | null>(null);
  const [config, setConfig] = useState<SystemConfigResponse | null>(null);
  const [sidebarPane, setSidebarPane] = useState<SidebarPane>("overview");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingRootRequest, setPendingRootRequest] = useState<RootPromptState | null>(null);
  const [rootSubmitting, setRootSubmitting] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);

  const thinkingIdRef = useRef<string | null>(null);
  const thinkingContentRef = useRef("");
  const reportIdRef = useRef<string | null>(null);
  const reportContentRef = useRef("");
  const phaseIdRef = useRef<string | null>(null);
  const currentExecRef = useRef<{ id: string; tool: string } | null>(null);
  const blocksEndRef = useRef<HTMLDivElement>(null);

  const { streaming, startStream, stopStream } = useSSE();

  const scrollToEnd = useCallback(() => {
    setTimeout(() => blocksEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);
  }, []);

  const appendBlock = useCallback((block: RenderBlock) => {
    setBlocks((previous) => [...previous, block]);
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<RenderBlock>) => {
    setBlocks((previous) => previous.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }, []);

  const appendObservation = useCallback(
    (title: string, content: string) => {
      appendBlock({
        id: nextBlockId(),
        type: "observation",
        timestamp: new Date(),
        content: `## ${title}\n\n${content}`,
      });
      scrollToEnd();
    },
    [appendBlock, scrollToEnd],
  );

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

  const refreshWorkbench = useCallback(async () => {
    const [sessionsResult, toolsResult, agentsResult, configResult] = await Promise.allSettled([
      fetchJson<SessionsResponse>("/api/sessions"),
      fetchJson<ToolsResponse>("/api/tools"),
      fetchJson<AgentListResponse>("/api/agents"),
      fetchJson<SystemConfigResponse>("/api/system/config"),
    ]);

    if (sessionsResult.status === "fulfilled") {
      setSessionNote(sessionsResult.value.note ?? `共 ${sessionsResult.value.sessions.length} 条会话记录`);
    } else {
      setSessionNote("无法加载会话说明（后端未就绪）");
    }

    setTools(toolsResult.status === "fulfilled" ? toolsResult.value : null);
    setAgents(agentsResult.status === "fulfilled" ? agentsResult.value : null);
    setConfig(configResult.status === "fulfilled" ? configResult.value : null);
  }, []);

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
    const intervalId = setInterval(tick, backendOk ? 10000 : 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [backendOk]);

  useEffect(() => {
    void refreshWorkbench();
  }, [refreshWorkbench, backendOk]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const currentPhase = useMemo(() => {
    const last = [...blocks].reverse().find((block) => block.type === "task_phase");
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
          setPhase("thinking", "已连接后端");
          break;
        }
        case "root_required": {
          const request = {
            requestId: String(data.request_id ?? ""),
            command: String(data.command ?? ""),
          };
          setPendingRootRequest(request);
          setRootError(null);
          appendObservation(
            "需要管理员权限",
            `后端请求执行需要提权的命令：\n\n${request.command}\n\n请在弹窗中选择执行策略。`,
          );
          break;
        }
        case "done": {
          setPhase("done");
          if (thinkingIdRef.current) updateBlock(thinkingIdRef.current, { streaming: false });
          if (reportIdRef.current) updateBlock(reportIdRef.current, { streaming: false });
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
    [agentSubType, appendBlock, appendObservation, mode, scrollToEnd, setPhase, updateBlock],
  );

  const submitPrompt = useCallback(
    (
      prompt: string,
      nextMode: "ask" | "agent" = mode,
      nextAgent: AgentMode = agentSubType,
    ) => {
      const trimmed = prompt.trim();
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

      startStream(
        "/api/chat",
        {
          message: trimmed,
          mode: nextMode,
          agent: nextMode === "agent" ? nextAgent : "secbot-cli",
        },
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
    },
    [
      agentSubType,
      appendBlock,
      handleSSEEvent,
      mode,
      scrollToEnd,
      setPhase,
      startStream,
      streaming,
      updateBlock,
    ],
  );

  const handleSend = useCallback(() => {
    submitPrompt(input, mode, agentSubType);
  }, [agentSubType, input, mode, submitPrompt]);

  const handleRootResponse = useCallback(
    async (action: RootAction, password?: string) => {
      if (!pendingRootRequest) return;
      setRootSubmitting(true);
      setRootError(null);
      try {
        await postJson("/api/chat/root-response", {
          request_id: pendingRootRequest.requestId,
          action,
          password,
        });
        appendObservation(
          "管理员权限响应已提交",
          `策略：${action}${password ? "，已附带密码" : ""}`,
        );
        setPendingRootRequest(null);
      } catch (error) {
        setRootError(error instanceof Error ? error.message : String(error));
      } finally {
        setRootSubmitting(false);
      }
    },
    [appendObservation, pendingRootRequest],
  );

  const handleClearMemory = useCallback(async () => {
    try {
      const response = await postJson<{ success: boolean; message: string }>("/api/agents/clear", {});
      appendObservation("记忆清理", response.message);
    } catch (error) {
      appendObservation("记忆清理失败", error instanceof Error ? error.message : String(error));
    }
  }, [appendObservation]);

  const statusText = useMemo(() => {
    if (!streaming && currentPhase === "done") return "空闲";
    const label = PHASE_LABELS[currentPhase] ?? currentPhase;
    return streaming ? `流式中 · ${label}` : label;
  }, [currentPhase, streaming]);

  const backendPillClass = backendOk === null ? "wait" : backendOk ? "ok" : "err";
  const backendText =
    backendOk === null
      ? "检测后端…"
      : backendOk
        ? `后端已连接${hostInfo ? ` · ${hostInfo}` : ""}`
        : "后端未就绪（正在启动或端口占用）";

  const commandOptions = useMemo<CommandOption[]>(
    () => [
      {
        id: "mode-ask",
        label: "切换到 Ask 模式",
        description: "使用问答模式，不进入自动执行链路。",
        keywords: ["ask", "模式"],
        onSelect: () => setMode("ask"),
      },
      {
        id: "mode-agent",
        label: "切换到 Agent 模式",
        description: "启用自动执行的安全终端模式。",
        keywords: ["agent", "模式"],
        onSelect: () => setMode("agent"),
      },
      {
        id: "agent-auto",
        label: "切换智能体：自动",
        description: "选择 secbot-cli 作为执行智能体。",
        keywords: ["agent", "secbot-cli", "自动"],
        onSelect: () => {
          setMode("agent");
          setAgentSubType("secbot-cli");
        },
      },
      {
        id: "agent-expert",
        label: "切换智能体：专家",
        description: "选择 superhackbot 作为执行智能体。",
        keywords: ["agent", "superhackbot", "专家"],
        onSelect: () => {
          setMode("agent");
          setAgentSubType("superhackbot");
        },
      },
      {
        id: "prompt-discover",
        label: "发起：内网发现",
        description: "直接发起一条内网发现任务。",
        keywords: ["network", "discover", "局域网"],
        disabled: streaming,
        onSelect: () => submitPrompt(QUICK_PROMPTS[0].prompt, "agent", agentSubType),
      },
      {
        id: "prompt-defense",
        label: "发起：防御扫描",
        description: "执行一次完整安全扫描。",
        keywords: ["defense", "scan"],
        disabled: streaming,
        onSelect: () => submitPrompt(QUICK_PROMPTS[1].prompt, "agent", agentSubType),
      },
      {
        id: "show-tools",
        label: "插入：工具概览",
        description: "把当前工具分类概览输出到时间线。",
        keywords: ["tools", "工具"],
        onSelect: () => appendObservation("工具概览", formatToolsSummary(tools)),
      },
      {
        id: "show-agents",
        label: "插入：智能体概览",
        description: "把当前智能体信息输出到时间线。",
        keywords: ["agents", "智能体"],
        onSelect: () => appendObservation("智能体概览", formatAgentsSummary(agents)),
      },
      {
        id: "show-system",
        label: "插入：系统配置摘要",
        description: "把当前推理后端和模型配置输出到时间线。",
        keywords: ["system", "config", "模型"],
        onSelect: () => appendObservation("系统配置摘要", formatSystemSummary(config)),
      },
      {
        id: "refresh-workbench",
        label: "刷新工作台数据",
        description: "重新获取 tools、agents、system、sessions 信息。",
        keywords: ["refresh", "刷新", "workbench"],
        onSelect: () => void refreshWorkbench(),
      },
      {
        id: "clear-memory",
        label: "清空所有智能体记忆",
        description: "调用 /api/agents/clear 清空记忆。",
        keywords: ["memory", "clear", "记忆"],
        onSelect: () => void handleClearMemory(),
      },
      {
        id: "stop-stream",
        label: "停止当前流式执行",
        description: "立即终止当前 SSE 请求。",
        keywords: ["stop", "abort", "停止"],
        disabled: !streaming,
        onSelect: () => stopStream(),
      },
    ],
    [
      agentSubType,
      agents,
      appendObservation,
      config,
      handleClearMemory,
      refreshWorkbench,
      stopStream,
      streaming,
      submitPrompt,
      tools,
    ],
  );

  const sidebarBody = useMemo(() => {
    if (sidebarPane === "tools") {
      return (
        <>
          <div className="panel-card">
            <div className="panel-eyebrow">Capabilities</div>
            <h3>工具总览</h3>
            <p>{tools ? `共 ${tools.total} 个工具，覆盖 ${tools.categories.length} 个分类。` : "工具列表尚未加载。"}</p>
          </div>
          {tools?.categories.slice(0, 6).map((category) => (
            <div key={category.id} className="panel-card compact">
              <div className="metric-row">
                <span>{category.name}</span>
                <strong>{category.count}</strong>
              </div>
              <p>{category.tools.slice(0, 2).map((tool) => tool.name).join(" · ") || "暂无工具"}</p>
            </div>
          ))}
        </>
      );
    }

    if (sidebarPane === "agents") {
      return (
        <>
          <div className="panel-card">
            <div className="panel-eyebrow">Agents</div>
            <h3>当前执行角色</h3>
            <p>{mode === "agent" ? agentSubType : "ask 模式"}</p>
            <button type="button" className="secondary-button" onClick={() => void handleClearMemory()}>
              清空记忆
            </button>
          </div>
          {agents?.agents.map((agent) => (
            <div key={agent.type} className="panel-card compact">
              <div className="metric-row">
                <span>{agent.name}</span>
                <strong>{agent.type}</strong>
              </div>
              <p>{agent.description}</p>
            </div>
          )) ?? <div className="panel-card compact"><p>智能体列表尚未加载。</p></div>}
        </>
      );
    }

    if (sidebarPane === "system") {
      return (
        <>
          <div className="panel-card">
            <div className="panel-eyebrow">System</div>
            <h3>后端连接</h3>
            <p>{backendText}</p>
            <button type="button" className="secondary-button" onClick={() => void refreshWorkbench()}>
              刷新系统信息
            </button>
          </div>
          <div className="panel-card compact">
            <div className="metric-row">
              <span>Provider</span>
              <strong>{config?.llm_provider ?? "未加载"}</strong>
            </div>
            <p>当前模型：{config?.current_provider_model ?? "未提供"}</p>
            <p>Ollama：{config?.ollama_model ?? "未提供"}</p>
          </div>
          <div className="panel-card compact">
            <div className="metric-row">
              <span>Base URL</span>
            </div>
            <p>{config?.current_provider_base_url ?? config?.ollama_base_url ?? "未提供"}</p>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="panel-card">
          <div className="panel-eyebrow">Mission</div>
          <h3>会话说明</h3>
          <p>{sessionNote}</p>
        </div>
        <div className="panel-card">
          <div className="panel-eyebrow">Quick Runs</div>
          <h3>常用任务</h3>
          <div className="quick-stack">
            {QUICK_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                className="quick-tile"
                disabled={streaming}
                onClick={() => submitPrompt(item.prompt, "agent", agentSubType)}
              >
                <span>{item.label}</span>
                <small>{item.prompt}</small>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }, [
    agentSubType,
    agents?.agents,
    backendText,
    config,
    handleClearMemory,
    mode,
    refreshWorkbench,
    sessionNote,
    sidebarPane,
    streaming,
    submitPrompt,
    tools,
  ]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">SB</div>
          <div>
            <div className="brand-title">Secbot Workbench</div>
            <div className="brand-subtitle">desktop terminal console</div>
          </div>
        </div>

        <span className={`backend-pill ${backendPillClass}`}>{backendText}</span>

        <div className="segmented">
          <button type="button" className={mode === "ask" ? "active" : ""} onClick={() => setMode("ask")}>
            Ask
          </button>
          <button type="button" className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}>
            Agent
          </button>
        </div>

        {mode === "agent" ? (
          <div className="segmented secondary">
            <button
              type="button"
              className={agentSubType === "secbot-cli" ? "active" : ""}
              onClick={() => setAgentSubType("secbot-cli")}
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
        ) : null}

        <div className="status-line">
          <span className={`status-dot ${streaming ? "live" : "idle"}`} />
          <span>{statusText}</span>
        </div>

        <button type="button" className="command-trigger" onClick={() => setPaletteOpen(true)}>
          命令面板
          <span>Cmd/Ctrl + K</span>
        </button>
      </header>

      <div className="main-layout">
        <aside className="nav-rail">
          <div className="rail-tabs">
            {SIDEBAR_PANES.map((pane) => (
              <button
                key={pane.id}
                type="button"
                className={`rail-tab ${sidebarPane === pane.id ? "active" : ""}`}
                onClick={() => setSidebarPane(pane.id)}
              >
                <span>{pane.label}</span>
                <small>{pane.hint}</small>
              </button>
            ))}
          </div>
          <div className="rail-body">{sidebarBody}</div>
        </aside>

        <main className="chat-col">
          <section className="workspace-panel workspace-hero">
            <div>
              <div className="panel-eyebrow">Live Session</div>
              <h1>终端任务工作台</h1>
              <p>这里承接 chat timeline、工具执行流和报告输出，后续会继续扩展系统配置、工具中心与诊断能力。</p>
            </div>
            <div className="hero-actions">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="hero-chip"
                  disabled={streaming}
                  onClick={() => submitPrompt(item.prompt, "agent", agentSubType)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <section className="workspace-panel blocks-panel">
            <div className="panel-header">
              <div>
                <div className="panel-eyebrow">Timeline</div>
                <h2>执行流</h2>
              </div>
              <div className="panel-actions">
                <button type="button" className="secondary-button" onClick={() => appendObservation("工具概览", formatToolsSummary(tools))}>
                  插入工具概览
                </button>
                <button type="button" className="secondary-button" onClick={() => appendObservation("系统配置摘要", formatSystemSummary(config))}>
                  插入系统摘要
                </button>
                <button type="button" className="secondary-button" onClick={() => void refreshWorkbench()}>
                  刷新
                </button>
              </div>
            </div>

            <div className="blocks">
              {blocks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-title">发送任务开始终端会话</div>
                  <div className="empty-copy">
                    当前模式：{mode === "agent" ? `Agent · ${agentSubType}` : "Ask"}。你也可以先用上面的快捷任务生成第一条消息。
                  </div>
                </div>
              ) : (
                blocks.map((block) => <BlockView key={block.id} block={block} />)
              )}
              <div ref={blocksEndRef} />
            </div>
          </section>

          <section className="composer-panel">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              rows={3}
            />
            <div className="composer-actions">
              <button type="button" className="secondary-button" onClick={() => setPaletteOpen(true)}>
                打开命令面板
              </button>
              {streaming ? (
                <button type="button" className="primary-button muted" onClick={() => stopStream()}>
                  停止
                </button>
              ) : (
                <button type="button" className="primary-button" disabled={!input.trim()} onClick={handleSend}>
                  发送
                </button>
              )}
            </div>
          </section>
        </main>

        <WorkbenchInspector blocks={blocks} streaming={streaming} currentPhase={currentPhase} />
      </div>

      <CommandPalette open={paletteOpen} options={commandOptions} onClose={() => setPaletteOpen(false)} />

      <RootPermissionModal
        open={pendingRootRequest !== null}
        command={pendingRootRequest?.command ?? ""}
        submitting={rootSubmitting}
        error={rootError}
        onClose={() => {
          void handleRootResponse("deny");
        }}
        onSubmit={(action, password) => {
          void handleRootResponse(action, password);
        }}
      />
    </div>
  );
}
