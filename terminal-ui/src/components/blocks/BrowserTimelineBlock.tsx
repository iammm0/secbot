/**
 * 浏览器时间线块 — 渲染 ExploreAgent 的虚拟浏览器跳转轨迹
 *
 * 显示原则（修订后）：
 *  - 默认不展示 thought 步骤（噪声过大，由"推理"块单独展示）
 *  - 全部用 ASCII 图标（emoji 在不同终端宽度不一致，容易破坏对齐）
 *  - label / detail 截断到固定列宽，避免 Ink 在窄终端中折行错位
 *  - 超过 MAX_STEPS_VISIBLE 步时折叠显示 "… 已折叠 N 步"
 *  - 末尾汇总 facts / unresolved / summary 单行
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/ThemeContext.js";
import type { BrowserStep, ContentBlock } from "../../types.js";

interface BrowserTimelineBlockProps {
  block: ContentBlock;
  noMargin?: boolean;
}

interface RenderedStep {
  icon: string;
  label: string;
  detail?: string;
  dim?: boolean;
  ok?: boolean;
  bad?: boolean;
}

const LABEL_MAX = 84;
const DETAIL_MAX = 120;
/** 同一次 explore 最多展示这么多步骤，超出折叠 */
const MAX_STEPS_VISIBLE = 10;

function shortenLabel(text: string, max = LABEL_MAX): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max - 1)) + "…";
}

function shortenDetail(text: string, max = DETAIL_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, Math.max(1, max - 1)) + "…";
}

function shortenUrl(url: string, max = 60): string {
  if (url.length <= max) return url;
  try {
    const u = new URL(url);
    const host = u.host;
    const path = u.pathname + u.search;
    if (host.length + 1 < max) {
      const room = max - host.length - 4;
      const tail = path.length > room ? path.slice(0, room) + "…" : path;
      return `${host}${tail}`;
    }
    return host;
  } catch {
    return url.slice(0, max - 1) + "…";
  }
}

function deriveLabel(step: BrowserStep): RenderedStep {
  const target = step.target ?? "";
  const detail = step.detail ?? "";

  if (step.kind === "start") {
    return { icon: ">", label: "开始探索", ok: true };
  }
  if (step.kind === "end") {
    return { icon: "*", label: "结束", detail, ok: true };
  }
  if (step.kind === "sensitive_denied") {
    return { icon: "x", label: `拒绝敏感工具 ${step.tool ?? ""}`.trim(), detail, bad: true };
  }
  if (step.kind === "action_error") {
    return { icon: "x", label: `失败 ${step.tool ?? ""}`.trim(), detail, bad: true };
  }

  const tool = step.tool ?? "";
  if (tool === "browser_session") {
    if (target.startsWith("action:")) {
      return { icon: ".", label: target.replace("action:", ""), detail };
    }
    if (target.startsWith("link:")) {
      return { icon: ">", label: `follow ${target.replace("link:", "")}`, detail };
    }
    if (/^https?:\/\//i.test(target)) {
      return { icon: "@", label: shortenUrl(target), detail };
    }
    if (target) {
      return { icon: "?", label: `search "${target}"`, detail };
    }
    return { icon: ".", label: "browser_session", detail, dim: true };
  }
  if (tool === "vuln_db_query") {
    return { icon: "#", label: `vuln_db_query${target ? ` · ${target}` : ""}`, detail };
  }
  if (tool === "smart_search") {
    return { icon: "?", label: `smart_search "${target}"`, detail };
  }
  if (tool === "page_extract") {
    return { icon: "=", label: `page_extract ${shortenUrl(target)}`, detail };
  }
  if (tool === "deep_crawl") {
    return { icon: "=", label: `deep_crawl ${shortenUrl(target)}`, detail };
  }
  if (tool === "api_client") {
    return { icon: "<>", label: `api_client ${target}`, detail };
  }
  if (tool) {
    return { icon: ".", label: tool, detail };
  }
  return { icon: ".", label: step.kind, detail, dim: true };
}

export function BrowserTimelineBlock({ block, noMargin }: BrowserTimelineBlockProps) {
  const theme = useTheme();
  const rawSteps = block.browserSteps ?? [];
  /** thought 噪声过大，已经在 "推理" 块单独展示，这里默认隐藏 */
  const steps = rawSteps.filter((s) => s.kind !== "thought");
  const focus = block.focus ?? [];
  const summary = block.exploreSummary;
  const title = block.title || "ExploreAgent · 浏览路径";

  let displaySteps: BrowserStep[] = steps;
  let hiddenCount = 0;
  if (steps.length > MAX_STEPS_VISIBLE) {
    const head = steps.slice(0, 2);
    const tail = steps.slice(steps.length - (MAX_STEPS_VISIBLE - 2));
    displaySteps = [...head, ...tail];
    hiddenCount = steps.length - MAX_STEPS_VISIBLE;
  }

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      <Text color={theme.secondary} bold>
        {"◉ "}
        {title}
      </Text>

      {focus.length > 0 ? (
        <Box paddingLeft={2}>
          <Text color={theme.textMuted}>focus: {shortenLabel(focus.join(", "), 100)}</Text>
        </Box>
      ) : null}

      <Box flexDirection="column" paddingLeft={2}>
        {displaySteps.length === 0 ? (
          <Text color={theme.textMuted}>（无可展示步骤）</Text>
        ) : (
          displaySteps.map((step, idx) => {
            const rendered = deriveLabel(step);
            const color = rendered.bad
              ? theme.error
              : rendered.ok
                ? theme.success
                : rendered.dim
                  ? theme.textMuted
                  : theme.text;
            const label = shortenLabel(`${rendered.icon} ${rendered.label}`);
            const detailText = rendered.detail ? shortenDetail(rendered.detail) : "";
            const isFoldBoundary = hiddenCount > 0 && idx === 1;
            return (
              <Box key={`${step.index}-${idx}`} flexDirection="column">
                <Text color={color}>{label}</Text>
                {detailText ? (
                  <Box paddingLeft={3}>
                    <Text color={theme.textMuted} dimColor>
                      {detailText}
                    </Text>
                  </Box>
                ) : null}
                {isFoldBoundary ? (
                  <Text color={theme.textMuted} dimColor>
                    … 已折叠 {hiddenCount} 步
                  </Text>
                ) : null}
              </Box>
            );
          })
        )}
      </Box>

      {summary ? (
        <Box paddingLeft={2}>
          <Text color={theme.text}>
            facts {summary.factsCount ?? 0}
            {summary.unresolved && summary.unresolved.length > 0
              ? `  ·  unresolved ${summary.unresolved.length}`
              : ""}
            {summary.summary ? `  ·  ${shortenLabel(summary.summary, 80)}` : ""}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
