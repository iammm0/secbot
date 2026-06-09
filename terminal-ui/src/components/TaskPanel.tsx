import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../contexts/ThemeContext.js";
import type {
  ContextUsageSnapshot,
  StreamState,
  StreamTimelineItem,
  TodoItemData,
} from "../types.js";

type PanelStatus = "pending" | "success" | "error" | "info";

interface TaskPanelTodo {
  content: string;
  status: PanelStatus;
}

interface TaskPanelTool {
  label: string;
  status: PanelStatus;
  detail?: string;
}

export interface TaskPanelSnapshot {
  todos: TaskPanelTodo[];
  tools: TaskPanelTool[];
  contextUsage: ContextUsageSnapshot | null;
}

interface TaskPanelProps {
  snapshot: TaskPanelSnapshot;
  width: number;
}

const MAX_TODOS = 9;
const MAX_TOOLS = 8;

function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1_000) return String(Math.floor(n));
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1_000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function toPanelStatus(status?: string): PanelStatus {
  if (!status) return "pending";
  const lower = status.toLowerCase();
  if (lower === "done" || lower === "completed" || lower === "完成") {
    return "success";
  }
  if (
    lower === "failed" ||
    lower === "error" ||
    lower === "cancelled" ||
    lower === "失败"
  ) {
    return "error";
  }
  return "pending";
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(1, max - 3))}...`;
}

function mapTodo(todo: TodoItemData): TaskPanelTodo {
  return {
    content: todo.content,
    status: toPanelStatus(todo.status),
  };
}

function toolFromTimeline(item: StreamTimelineItem): TaskPanelTool | null {
  if (item.type === "action") {
    const status =
      item.status === "done"
        ? item.success === false
          ? "error"
          : "success"
        : "pending";
    return {
      label: item.tool || item.title || "tool",
      status,
      detail: item.error || item.body,
    };
  }

  if (item.type === "observation") {
    return {
      label: item.tool || item.title || "observation",
      status: item.error ? "error" : "info",
      detail: item.error || item.title,
    };
  }

  if (item.type === "browser_event") {
    const steps = item.browserSteps ?? [];
    const hasError = steps.some(
      (step) => step.kind === "action_error" || step.kind === "sensitive_denied",
    );
    return {
      label: "browser",
      status: hasError ? "error" : item.status === "done" ? "success" : "pending",
      detail: steps.length > 0 ? `${steps.length} steps` : item.title,
    };
  }

  return null;
}

export function buildTaskPanelSnapshot(streamState: StreamState): TaskPanelSnapshot {
  const timelineTodos = streamState.timeline
    .filter((item) => item.type === "planning")
    .flatMap((item) => item.todos ?? []);
  const todos = (timelineTodos.length > 0
    ? timelineTodos
    : streamState.planning?.todos ?? []
  ).map(mapTodo);

  const timelineTools = streamState.timeline
    .map(toolFromTimeline)
    .filter((item): item is TaskPanelTool => Boolean(item));
  const fallbackTools = streamState.actions.map((action) => ({
    label: action.tool,
    status:
      action.result === undefined
        ? "pending"
        : action.success === false
          ? "error"
          : "success",
    detail: action.error,
  } satisfies TaskPanelTool));
  const tools = (timelineTools.length > 0 ? timelineTools : fallbackTools).slice(
    -MAX_TOOLS,
  );

  return {
    todos,
    tools,
    contextUsage: streamState.contextUsage,
  };
}

function statusIcon(status: PanelStatus): string {
  if (status === "success") return "✓";
  if (status === "error") return "x";
  if (status === "info") return "-";
  return "~";
}

function statusColor(status: PanelStatus, theme: ReturnType<typeof useTheme>) {
  if (status === "success") return theme.success;
  if (status === "error") return theme.error;
  if (status === "info") return theme.secondary;
  return theme.textMuted;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Box marginTop={1}>
      <Text color={theme.secondary} bold wrap="truncate">
        {children}
      </Text>
    </Box>
  );
}

export function TaskPanel({ snapshot, width }: TaskPanelProps) {
  const theme = useTheme();
  const visibleTodos = snapshot.todos.slice(0, MAX_TODOS);
  const hiddenTodos = Math.max(0, snapshot.todos.length - visibleTodos.length);
  const usage = snapshot.contextUsage;
  const pct = usage ? Math.round(Math.min(1, Math.max(0, usage.ratio)) * 100) : 0;
  const ctxColor =
    pct >= 90 ? theme.error : pct >= 70 ? theme.warning : theme.secondary;

  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      width={width}
      minWidth={width}
      borderStyle="single"
      borderColor={theme.border}
      paddingLeft={1}
      paddingRight={1}
    >
      <Text color={theme.success} bold wrap="truncate">
        TASKS
      </Text>

      <SectionTitle>plan</SectionTitle>
      {visibleTodos.length === 0 ? (
        <Text color={theme.textMuted} dimColor wrap="truncate">
          no tasks yet
        </Text>
      ) : (
        visibleTodos.map((todo, index) => {
          const color = statusColor(todo.status, theme);
          const dim = todo.status === "pending";
          return (
            <Text key={`${todo.content}-${index}`} color={color} dimColor={dim} wrap="truncate">
              {statusIcon(todo.status)} {truncate(todo.content, width - 6)}
            </Text>
          );
        })
      )}
      {hiddenTodos > 0 ? (
        <Text color={theme.textMuted} dimColor wrap="truncate">
          ... +{hiddenTodos} more
        </Text>
      ) : null}

      <SectionTitle>tools</SectionTitle>
      {snapshot.tools.length === 0 ? (
        <Text color={theme.textMuted} dimColor wrap="truncate">
          no tools yet
        </Text>
      ) : (
        snapshot.tools.map((tool, index) => {
          const color = statusColor(tool.status, theme);
          const dim = tool.status === "pending";
          const detail = tool.detail ? ` · ${truncate(tool.detail, 18)}` : "";
          return (
            <Text key={`${tool.label}-${index}`} color={color} dimColor={dim} wrap="truncate">
              {statusIcon(tool.status)} {truncate(tool.label, 14)}
              <Text color={theme.textMuted} dimColor>
                {detail}
              </Text>
            </Text>
          );
        })
      )}

      <SectionTitle>context</SectionTitle>
      {usage ? (
        <>
          <Text color={ctxColor} wrap="truncate">
            ctx {pct}% {formatTokenCount(usage.usedTokens)}/
            {formatTokenCount(usage.promptBudget)}
          </Text>
          <Text color={theme.textMuted} dimColor wrap="truncate">
            {usage.model ?? "model?"}
          </Text>
          <Text color={theme.textMuted} dimColor wrap="truncate">
            pinned {usage.pinned} · focus {usage.focus.length}
          </Text>
        </>
      ) : (
        <Text color={theme.textMuted} dimColor wrap="truncate">
          ctx --
        </Text>
      )}
    </Box>
  );
}
