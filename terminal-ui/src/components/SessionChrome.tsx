import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "../contexts/ThemeContext.js";
import type { ContextUsageSnapshot } from "../types.js";

function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1_000) return String(Math.floor(n));
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1_000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatBackend(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.replace(/^https?:\/\//i, "") || "backend?";
  }
}

function formatContextUsage(usage: ContextUsageSnapshot | null): string {
  if (!usage) return "ctx --";
  const pct = Math.round(Math.min(1, Math.max(0, usage.ratio)) * 100);
  const used = formatTokenCount(usage.usedTokens);
  const budget = formatTokenCount(usage.promptBudget);
  return `ctx ${pct}% ${used}/${budget}`;
}

function phaseLabel(streaming: boolean, phase?: string, detail?: string): string {
  if (!streaming) return "idle";
  const raw = detail?.trim() || phase?.trim() || "running";
  return raw.length > 32 ? `${raw.slice(0, 31)}...` : raw;
}

interface TopStatusBarProps {
  sessionLabel: string;
  mode: string;
  agent: string;
  backendUrl: string;
  usage: ContextUsageSnapshot | null;
  streaming: boolean;
  phase?: string;
  detail?: string;
}

export function TopStatusBar({
  sessionLabel,
  mode,
  agent,
  backendUrl,
  usage,
  streaming,
  phase,
  detail,
}: TopStatusBarProps) {
  const theme = useTheme();
  const ratio = usage ? Math.min(1, Math.max(0, usage.ratio)) : 0;
  const ctxColor =
    ratio >= 0.9 ? theme.error : ratio >= 0.7 ? theme.warning : theme.secondary;
  const model = usage?.model || "model?";
  const backend = formatBackend(backendUrl);

  return (
    <Box
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={2}
      paddingRight={2}
    >
      <Box flexShrink={1} minWidth={0}>
        <Text wrap="truncate">
          <Text color={theme.success} bold>
            SECBOT
          </Text>
          <Text color={theme.textMuted}>  </Text>
          <Text color={theme.secondary}>{sessionLabel}</Text>
          <Text color={theme.textMuted}> · {mode} · {agent}</Text>
        </Text>
      </Box>
      <Box flexShrink={0} marginLeft={2}>
        <Text wrap="truncate">
          <Text color={streaming ? theme.warning : theme.textMuted}>
            {phaseLabel(streaming, phase, detail)}
          </Text>
          <Text color={theme.textMuted}> · {backend} · {model} · </Text>
          <Text color={ctxColor}>{formatContextUsage(usage)}</Text>
        </Text>
      </Box>
    </Box>
  );
}

interface ComposerRowProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
}

export function ComposerRow({
  value,
  onChange,
  onSubmit,
  placeholder,
}: ComposerRowProps) {
  const theme = useTheme();
  return (
    <Box
      flexShrink={0}
      flexDirection="row"
      paddingLeft={2}
      paddingRight={2}
    >
      <Text color={theme.secondary} bold>
        {"› "}
      </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
      />
    </Box>
  );
}

interface BottomStatusLineProps {
  totalLines: number;
  scrollOffset: number;
  scrollableHeight: number;
  pageUpLabel: string;
  pageDownLabel: string;
  taskPanelLabel: string;
  taskPanelVisible: boolean;
  taskPanelAvailable: boolean;
  showUpIndicator: boolean;
  showDownIndicator: boolean;
  version?: string;
}

export function BottomStatusLine({
  totalLines,
  scrollOffset,
  scrollableHeight,
  pageUpLabel,
  pageDownLabel,
  taskPanelLabel,
  taskPanelVisible,
  taskPanelAvailable,
  showUpIndicator,
  showDownIndicator,
  version,
}: BottomStatusLineProps) {
  const theme = useTheme();
  const range =
    totalLines > 0
      ? `${Math.min(scrollOffset + 1, totalLines)}-${Math.min(
          scrollOffset + scrollableHeight,
          totalLines,
        )}/${totalLines}`
      : "--";
  const arrows = `${showUpIndicator ? "↑" : " "} ${showDownIndicator ? "↓" : " "}`;

  return (
    <Box
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={2}
      paddingRight={2}
      paddingBottom={1}
    >
      <Box flexShrink={1} minWidth={0}>
        <Text color={theme.textMuted} wrap="truncate">
          {range} · {arrows} · {pageUpLabel}/{pageDownLabel} scroll · tasks{" "}
          {taskPanelAvailable ? (taskPanelVisible ? "on" : "off") : "narrow"}{" "}
          {taskPanelLabel} · / commands
        </Text>
      </Box>
      {version ? (
        <Box flexShrink={0} marginLeft={2}>
          <Text color={theme.textMuted}>{version}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
