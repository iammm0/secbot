/**
 * 将 StreamState 转为分块结构，每块用 Markdown 渲染
 * 推理与执行链路：API → phase → error → 规划 → 推理 → 执行 → 内容 → 报告
 *
 * 更新说明：
 *  - streamStateToBlocks 支持 sentAt / completedAt 参数
 *  - 当前策略不再渲染独立 response 块，输出展示截止到“总结”阶段
 */
import type { StreamState } from "./types.js";
import type { ContentBlock } from "./types.js";

// ─── 常量 ──────────────────────────────────────────────────────────────────────

/** 执行结果类块最大展示行数，超出省略，避免刷屏 */
const MAX_RESULT_LINES = 24;

/** 完成后仅标识"完成"并随后消失、且不渲染其输出内容的工具 */
const TRANSIENT_TOOLS = new Set<string>(["system_info", "network_analyze"]);

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 计算一个块所占的逻辑行数。
 * @param title      块标题（若有则占 1 行）
 * @param body       块正文
 * @param extraLines 额外附加行数（如脚注、分隔线等）
 */
function blockLines(
  title: string | undefined,
  body: string,
  extraLines = 0,
): number {
  const bodyLines = body ? body.split("\n").length : 0;
  return (title ? 1 : 0) + Math.max(1, bodyLines) + extraLines;
}

/** 截断超长正文，避免刷屏 */
function truncateBody(body: string, maxLines: number): string {
  const lines = body.split("\n");
  if (lines.length <= maxLines) return body;
  return lines.slice(0, maxLines).join("\n") + "\n\n… 已省略";
}

/** 将连接中断等模糊错误转为可读提示 */
function normalizeErrorMessage(error: string): string {
  const lower = error.toLowerCase().trim();
  if (
    lower === "terminated" ||
    (lower.includes("stream") && lower.includes("terminated"))
  ) {
    return "连接已中断。可能原因：后端重启、网络波动或请求超时。请重试。";
  }
  if (lower.includes("aborted") || lower.includes("abort")) {
    return "请求已取消。";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "连接超时，请确认后端已启动且 SECBOT_API_URL 正确。";
  }
  return error;
}

/**
 * 从混合文本中提取纯 Thought 内容，避免 Action/Observation/Final Answer 挤入推理块。
 */
function extractThoughtOnly(raw: string): string {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  // 常见格式：Thought: ... Action: {...}
  const thoughtMatch = text.match(
    /(?:Thought|思考|推理)\s*[:：]\s*/i,
  );
  const afterThought = thoughtMatch
    ? text.slice((thoughtMatch.index ?? 0) + thoughtMatch[0].length)
    : text;

  const splitRegex =
    /(?:^|\n)\s*(?:Action\s*[:：]|Observation\s*[:：]|\[OBSERVATION\]|\[ACTION\]|Final Answer\s*[:：]|执行\s*[:：]|观察\s*[:：]|最终回答\s*[:：]|最终结论\s*[:：])/i;
  const m = splitRegex.exec(afterThought);
  const thoughtOnly = m
    ? afterThought.slice(0, m.index).trim()
    : afterThought.trim();

  if (thoughtOnly) return thoughtOnly;
  const jsonActionStart = afterThought.search(/\{\s*"tool"\s*:/i);
  if (jsonActionStart > 0) {
    return afterThought.slice(0, jsonActionStart).trim();
  }
  return afterThought.trim() || text;
}

// ─── 主函数 ────────────────────────────────────────────────────────────────────

/**
 * 将流式状态转换为可渲染的内容块数组。
 *
 * @param streamState            当前流式状态
 * @param streaming              是否仍在流式传输中
 * @param apiOutput              REST/斜杠命令的 API 输出（可为 null）
 * @param dismissedTransientTools 已"消失"的瞬时工具，不再展示
 * @param sentAt                 本轮用户消息的发送时刻（Date.now()），0 或未传则不注入
 * @param completedAt            本轮 Secbot 响应的完成时刻（Date.now()），0 或未传表示尚未完成
 */
export function streamStateToBlocks(
  streamState: StreamState,
  streaming: boolean,
  apiOutput: string | null,
  dismissedTransientTools?: Set<string>,
  sentAt?: number,
  completedAt?: number,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let lineStart = 0;

  const {
    phase,
    detail,
    planning,
    actions,
    error,
    timeline,
  } = streamState;

  const dismissed = dismissedTransientTools ?? new Set<string>();

  // 有效的 completedAt（> 0 且非 NaN）
  const validCompletedAt =
    completedAt && completedAt > 0 ? completedAt : undefined;
  // 耗时（毫秒），需要 sentAt 与 completedAt 均有效
  const durationMs =
    validCompletedAt && sentAt && sentAt > 0
      ? validCompletedAt - sentAt
      : undefined;

  // ── 内部辅助：添加正文块 ───────────────────────────────────────────────────────

  function addBlock(
    id: string,
    type: ContentBlock["type"],
    title: string,
    body: string,
    extra?: Partial<
      Pick<ContentBlock, "completedAt" | "durationMs" | "sentAt">
    >,
  ): void {
    const lineCount = blockLines(title, body);
    blocks.push({
      id,
      type,
      title,
      body,
      lineStart,
      lineEnd: lineStart + lineCount,
      ...extra,
    });
    lineStart += lineCount;
  }

  // ── API 输出 ──────────────────────────────────────────────────────────────────

  if (apiOutput !== null) {
    const body = truncateBody(apiOutput, MAX_RESULT_LINES);
    addBlock("api", "api", "API", body);
  }

  // ── 流式阶段指示（phase）────────────────────────────────────────────────────

  if (streaming && phase) {
    const body = detail ? `${phase}\n\n${detail}` : phase;
    const lineEnd = lineStart + blockLines(undefined, body);
    blocks.push({ id: "phase", type: "phase", body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  // ── 错误 ─────────────────────────────────────────────────────────────────────

  if (error) {
    const normalized = normalizeErrorMessage(error);
    const body = `**错误**\n\n${normalized}`;
    const lineEnd = lineStart + blockLines(undefined, body);
    blocks.push({ id: "error", type: "error", body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  // ── 规划 ─────────────────────────────────────────────────────────────────────

  if (planning) {
    const todos =
      planning.todos?.map((t) => ({ content: t.content, status: t.status })) ??
      [];
    const planningText = planning.content?.trim() ?? "";
    const hasPlanningText = planningText.length > 0;
    const body = hasPlanningText
      ? planningText
      : todos.length === 0
        ? "规划中…"
        : "";
    const planningLineCount =
      1 +
      (body ? Math.max(1, body.split("\n").length) : 0) +
      todos.length;
    const lineEnd = lineStart + planningLineCount;
    blocks.push({
      id: "planning",
      type: "planning",
      title: "规划",
      body,
      lineStart,
      lineEnd,
      todos,
    });
    lineStart = lineEnd;
  }

  // ── 时间线渲染（按事件发生顺序）───────────────────────────────────────────────
  if (timeline.length > 0) {
    for (const item of timeline) {
      if (item.type === "thought") {
        const extracted = extractThoughtOnly(item.body || "…");
        addBlock(
          item.id,
          "thought",
          item.title || "推理",
          truncateBody(extracted, MAX_RESULT_LINES),
        );
        continue;
      }

      if (item.type === "action") {
        if (item.tool && TRANSIENT_TOOLS.has(item.tool) && item.status === "done") {
          if (dismissed.has(item.tool)) continue;
        }
        const statusLine =
          item.status === "done"
            ? item.success === false
              ? "状态: 失败"
              : "状态: 完成"
            : "状态: 执行中";
        const errorLine = item.error ? `\n错误: ${item.error}` : "";
        addBlock(
          item.id,
          "actions",
          item.title || "工具调用",
          `${statusLine}${errorLine}`,
        );
        continue;
      }

      if (item.type === "observation") {
        const obsLabel = item.title
          || (item.tool
            ? `观察 · ${item.tool}${item.iteration ? ` #${item.iteration}` : ""}`
            : "总结观察");
        addBlock(
          item.id,
          "content",
          obsLabel,
          truncateBody(item.body || "…", MAX_RESULT_LINES),
        );
        continue;
      }

      if (item.type === "final") {
        addBlock(
          item.id,
          "summary",
          item.title || "最终总结",
          item.body || "…",
          {
            completedAt: validCompletedAt,
            durationMs,
            sentAt: sentAt && sentAt > 0 ? sentAt : undefined,
          },
        );
      }
    }
  } else {
    // 兼容旧结构：无 timeline 时退回到 content。
    if (actions.length > 0) {
      const filtered = actions.filter(
        (a) => !TRANSIENT_TOOLS.has(a.tool) || !dismissed.has(a.tool),
      );
      for (let i = 0; i < filtered.length; i++) {
        const a = filtered[i];
        const done = a.result !== undefined;
        const status = done ? (a.success ? "完成" : "失败") : "执行中";
        const err = a.error ? `\n错误: ${a.error}` : "";
        addBlock(
          `legacy-action-${i}`,
          "actions",
          `工具调用 · ${a.tool}`,
          `状态: ${status}${err}`,
        );
      }
    }
  }

  return blocks;
}
