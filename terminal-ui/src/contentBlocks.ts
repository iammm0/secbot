/**
 * 将 StreamState 转为分块结构，每块用 Markdown 渲染
 * 推理与执行链路：API → phase → error → 规划 → 推理 → 执行 → 内容 → 报告 → 回复
 *
 * 更新说明：
 *  - streamStateToBlocks 新增 sentAt / completedAt 参数
 *  - response 块注入 completedAt 与 durationMs 元数据，供 ResponseBlock 渲染完成时间脚注
 *  - response 块行数在 completedAt 有效时额外 +1（脚注行）
 */
import type { StreamState } from "./types.js";
import type { ContentBlock } from "./types.js";

// ─── 常量 ──────────────────────────────────────────────────────────────────────

/** 执行结果类块最大展示行数，超出省略，避免刷屏 */
const MAX_RESULT_LINES = 24;

/** 低于此行数不折叠，直接展示；超长内容才折叠 */
const COLLAPSE_THRESHOLD_LINES = 15;

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

// ─── 主函数 ────────────────────────────────────────────────────────────────────

/**
 * 将流式状态转换为可渲染的内容块数组。
 *
 * @param streamState            当前流式状态
 * @param streaming              是否仍在流式传输中
 * @param apiOutput              REST/斜杠命令的 API 输出（可为 null）
 * @param dismissedTransientTools 已"消失"的瞬时工具，不再展示
 * @param expandedBlockIds       已展开的块 id 集合
 * @param sentAt                 本轮用户消息的发送时刻（Date.now()），0 或未传则不注入
 * @param completedAt            本轮 Secbot 响应的完成时刻（Date.now()），0 或未传表示尚未完成
 */
export function streamStateToBlocks(
  streamState: StreamState,
  streaming: boolean,
  apiOutput: string | null,
  dismissedTransientTools?: Set<string>,
  expandedBlockIds?: Set<string>,
  sentAt?: number,
  completedAt?: number,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let lineStart = 0;

  const {
    phase,
    detail,
    planning,
    thought,
    thoughtChunks,
    actions,
    content,
    report,
    error,
    response,
  } = streamState;

  const dismissed = dismissedTransientTools ?? new Set<string>();
  const expanded = expandedBlockIds ?? new Set<string>();

  // 有效的 completedAt（> 0 且非 NaN）
  const validCompletedAt =
    completedAt && completedAt > 0 ? completedAt : undefined;
  // 耗时（毫秒），需要 sentAt 与 completedAt 均有效
  const durationMs =
    validCompletedAt && sentAt && sentAt > 0
      ? validCompletedAt - sentAt
      : undefined;

  // ── 内部辅助：添加可折叠块 ────────────────────────────────────────────────────

  function addCollapsibleBlock(
    id: string,
    type: ContentBlock["type"],
    title: string,
    fullBody: string,
    extra?: Partial<
      Pick<ContentBlock, "completedAt" | "durationMs" | "sentAt">
    >,
  ): void {
    const lineCount = blockLines(title, fullBody);
    const isExpanded = expanded.has(id);

    if (isExpanded || lineCount <= COLLAPSE_THRESHOLD_LINES) {
      blocks.push({
        id,
        type,
        title,
        body: fullBody,
        lineStart,
        lineEnd: lineStart + lineCount,
        ...extra,
      });
      lineStart += lineCount;
    } else {
      const numLines = fullBody.split("\n").length;
      const placeholder = `*(共 ${numLines} 行，${title}，按 Ctrl+E 展开)*`;
      blocks.push({
        id,
        type,
        title,
        body: placeholder,
        fullBody,
        lineStart,
        lineEnd: lineStart + 2,
        ...extra,
      });
      lineStart += 2;
    }
  }

  // ── API 输出 ──────────────────────────────────────────────────────────────────

  if (apiOutput !== null) {
    const body = truncateBody(apiOutput, MAX_RESULT_LINES);
    addCollapsibleBlock("api", "api", "API", body);
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
    let body = planning.content ? planning.content + "\n\n" : "";
    const todos =
      planning.todos?.map((t) => ({ content: t.content, status: t.status })) ??
      [];
    if (todos.length) {
      body += todos
        .map((t) => `- ${t.content}${t.status ? ` *(${t.status})*` : ""}`)
        .join("\n");
    }
    body = body || "规划中…";
    const lineEnd = lineStart + blockLines("规划", body);
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

  // ── 推理 ─────────────────────────────────────────────────────────────────────

  if (thought) {
    const chunk =
      thoughtChunks.get(thought.iteration) ?? thought.content ?? "…";
    const body = chunk;
    const title = `推理 #${thought.iteration}`;
    const lineEnd = lineStart + blockLines(title, body);
    blocks.push({
      id: `thought-${thought.iteration}`,
      type: "thought",
      title,
      body,
      lineStart,
      lineEnd,
    });
    lineStart = lineEnd;
  }

  // ── 工具执行 ─────────────────────────────────────────────────────────────────

  if (actions.length > 0) {
    const filtered = actions.filter(
      (a) => !TRANSIENT_TOOLS.has(a.tool) || !dismissed.has(a.tool),
    );

    const actionItems = filtered.map((a) => ({
      tool: a.tool,
      success: a.success,
      result: a.result,
      error: a.error,
    }));

    const body =
      filtered.length > 0
        ? filtered
            .map((a) => {
              const done = a.result !== undefined;
              const status = done ? (a.success ? "✓" : "✗") : "~";
              const label =
                TRANSIENT_TOOLS.has(a.tool) && done ? "完成" : status;
              let line = `- **${a.tool}** ${label}`;
              if (a.error) line += `\n  ${a.error}`;
              return line;
            })
            .join("\n")
        : "";

    if (body) {
      const lineEnd = lineStart + blockLines("执行", body);
      blocks.push({
        id: "actions",
        type: "actions",
        title: "执行",
        body,
        lineStart,
        lineEnd,
        actions: actionItems,
      });
      lineStart = lineEnd;
    }

    // Agent 终端结果以只读终端块展示
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (
        a.tool !== "terminal_session" ||
        a.result == null ||
        typeof a.result !== "object"
      )
        continue;
      const r = a.result as Record<string, unknown>;
      const output = r.output != null ? String(r.output) : null;
      const message = r.message != null ? String(r.message) : null;
      const bodyText = (output ?? message ?? "").trim();
      if (!bodyText) continue;

      const lineCount = blockLines("只读 · Agent 终端", bodyText);
      blocks.push({
        id: `terminal-session-${i}-${lineStart}`,
        type: "terminal",
        title: "只读 · Agent 终端",
        body: truncateBody(bodyText, MAX_RESULT_LINES),
        lineStart,
        lineEnd: lineStart + lineCount,
      });
      lineStart += lineCount;
    }
  }

  // ── 内容 ─────────────────────────────────────────────────────────────────────

  if (content) {
    const lastAction = actions.length > 0 ? actions[actions.length - 1] : null;
    if (!lastAction || !TRANSIENT_TOOLS.has(lastAction.tool)) {
      const body = truncateBody(content, MAX_RESULT_LINES);
      addCollapsibleBlock("content", "content", "内容", body);
    }
  }

  // ── 最终回复 ──────────────────────────────────────────────────────────────────
  // response 块注入 completedAt 与 durationMs，供 ResponseBlock 渲染完成时间脚注。
  // 当 completedAt 有效时，额外 +1 行用于脚注行（避免虚拟滚动裁剪脚注）。

  if (response) {
    const body = truncateBody(response, MAX_RESULT_LINES);
    const footerLines = validCompletedAt ? 1 : 0;
    const lineCount = blockLines("回复", body, footerLines);
    const isExpanded = expanded.has("response");

    if (isExpanded || lineCount <= COLLAPSE_THRESHOLD_LINES + footerLines) {
      blocks.push({
        id: "response",
        type: "response",
        title: "回复",
        body,
        lineStart,
        lineEnd: lineStart + lineCount,
        completedAt: validCompletedAt,
        durationMs,
        sentAt: sentAt && sentAt > 0 ? sentAt : undefined,
      });
      lineStart += lineCount;
    } else {
      const numLines = body.split("\n").length;
      const placeholder = `*(共 ${numLines} 行，回复，按 Ctrl+E 展开)*`;
      const placeholderLines = 2 + footerLines;
      blocks.push({
        id: "response",
        type: "response",
        title: "回复",
        body: placeholder,
        fullBody: body,
        lineStart,
        lineEnd: lineStart + placeholderLines,
        completedAt: validCompletedAt,
        durationMs,
        sentAt: sentAt && sentAt > 0 ? sentAt : undefined,
      });
      lineStart += placeholderLines;
    }
  }

  return blocks;
}
