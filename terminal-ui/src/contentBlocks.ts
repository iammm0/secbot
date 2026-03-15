/**
 * 将 StreamState 转为分块结构，每块用 Markdown 渲染
 * 推理与执行链路：API → phase → error → 规划 → 推理 → 执行 → 内容 → 报告 → 回复
 */
import type { StreamState } from './types.js';
import type { ContentBlock } from './types.js';

/** 执行结果类块最大展示行数，超出省略，避免刷屏 */
const MAX_RESULT_LINES = 24;

/** 低于此行数不折叠，直接展示；超长内容才折叠 */
const COLLAPSE_THRESHOLD_LINES = 15;

/** 完成后仅标识“完成”并随后消失、且不渲染其输出内容的工具 */
const TRANSIENT_TOOLS = new Set<string>(['system_info', 'network_analyze']);

function blockLines(title: string | undefined, body: string): number {
  const bodyLines = body ? body.split('\n').length : 0;
  return (title ? 1 : 0) + Math.max(1, bodyLines);
}

function truncateBody(body: string, maxLines: number): string {
  const lines = body.split('\n');
  if (lines.length <= maxLines) return body;
  return lines.slice(0, maxLines).join('\n') + '\n\n… 已省略';
}

/** 将连接中断等模糊错误转为可读提示 */
function normalizeErrorMessage(error: string): string {
  const lower = error.toLowerCase().trim();
  if (lower === 'terminated' || (lower.includes('stream') && lower.includes('terminated'))) {
    return '连接已中断。可能原因：后端重启、网络波动或请求超时。请重试。';
  }
  if (lower.includes('aborted') || lower.includes('abort')) {
    return '请求已取消。';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return '连接超时，请确认后端已启动且 SECBOT_API_URL 正确。';
  }
  return error;
}

export function streamStateToBlocks(
  streamState: StreamState,
  streaming: boolean,
  apiOutput: string | null,
  /** 已“消失”的瞬时工具，不再展示在执行列表中 */
  dismissedTransientTools?: Set<string>,
  /** 已展开的块 id，未在此集合中的可折叠块将显示为折叠 */
  expandedBlockIds?: Set<string>
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let lineStart = 0;
  const { phase, detail, planning, thought, thoughtChunks, actions, content, report, error, response } = streamState;
  const dismissed = dismissedTransientTools ?? new Set<string>();
  const expanded = expandedBlockIds ?? new Set<string>();

  function addCollapsibleBlock(id: string, type: ContentBlock['type'], title: string, fullBody: string): void {
    const lineCount = blockLines(title, fullBody);
    const isExpanded = expanded.has(id);
    if (isExpanded || lineCount <= COLLAPSE_THRESHOLD_LINES) {
      blocks.push({ id, type, title, body: fullBody, lineStart, lineEnd: lineStart + lineCount });
      lineStart += lineCount;
    } else {
      const numLines = fullBody.split('\n').length;
      const placeholder = `*(共 ${numLines} 行，${title}，按 Ctrl+E 展开)*`;
      blocks.push({ id, type, title, body: placeholder, fullBody, lineStart, lineEnd: lineStart + 2 });
      lineStart += 2;
    }
  }

  if (apiOutput !== null) {
    const body = truncateBody(apiOutput, MAX_RESULT_LINES);
    addCollapsibleBlock('api', 'api', 'API', body);
  }

  if (streaming && phase) {
    const body = detail ? `${phase}\n\n${detail}` : phase;
    const lineEnd = lineStart + blockLines(undefined, body);
    blocks.push({ id: 'phase', type: 'phase', body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  if (error) {
    const normalized = normalizeErrorMessage(error);
    const body = `**错误**\n\n${normalized}`;
    const lineEnd = lineStart + blockLines(undefined, body);
    blocks.push({ id: 'error', type: 'error', body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  if (planning) {
    let body = planning.content ? planning.content + '\n\n' : '';
    const todos = planning.todos?.map((t) => ({ content: t.content, status: t.status })) ?? [];
    if (todos.length) {
      body += todos.map((t) => `- ${t.content}${t.status ? ` *(${t.status})*` : ''}`).join('\n');
    }
    body = body || '规划中…';
    const lineEnd = lineStart + blockLines('规划', body);
    blocks.push({ id: 'planning', type: 'planning', title: '规划', body, lineStart, lineEnd, todos });
    lineStart = lineEnd;
  }

  if (thought) {
    const chunk = thoughtChunks.get(thought.iteration) ?? thought.content ?? '…';
    const body = chunk;
    const lineEnd = lineStart + blockLines(`推理 #${thought.iteration}`, body);
    blocks.push({ id: `thought-${thought.iteration}`, type: 'thought', title: `推理 #${thought.iteration}`, body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  if (actions.length > 0) {
    const filtered = actions.filter((a) => !TRANSIENT_TOOLS.has(a.tool) || !dismissed.has(a.tool));
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
              const status = done ? (a.success ? '✓' : '✗') : '…';
              const label = TRANSIENT_TOOLS.has(a.tool) && done ? '完成' : status;
              let line = `- **${a.tool}** ${label}`;
              if (a.error) line += `\n  ${a.error}`;
              return line;
            })
            .join('\n')
        : '';
    if (body) {
      const lineEnd = lineStart + blockLines('执行', body);
      blocks.push({ id: 'actions', type: 'actions', title: '执行', body, lineStart, lineEnd, actions: actionItems });
      lineStart = lineEnd;
    }
    // Agent 终端结果以只读终端块展示（用户仅可查看，不可输入）
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.tool !== 'terminal_session' || a.result == null || typeof a.result !== 'object') continue;
      const r = a.result as Record<string, unknown>;
      const output = r.output != null ? String(r.output) : null;
      const message = r.message != null ? String(r.message) : null;
      const bodyText = (output ?? message ?? '').trim();
      if (!bodyText) continue;
      const lineCount = blockLines('只读 · Agent 终端', bodyText);
      blocks.push({
        id: `terminal-session-${i}-${lineStart}`,
        type: 'terminal',
        title: '只读 · Agent 终端',
        body: truncateBody(bodyText, MAX_RESULT_LINES),
        lineStart,
        lineEnd: lineStart + lineCount,
      });
      lineStart += lineCount;
    }
  }

  if (content) {
    const lastAction = actions.length > 0 ? actions[actions.length - 1] : null;
    if (!lastAction || !TRANSIENT_TOOLS.has(lastAction.tool)) {
      const body = truncateBody(content, MAX_RESULT_LINES);
      addCollapsibleBlock('content', 'content', '内容', body);
    }
  }

  /* 报告块已移除：与回复内容重复，仅保留回复块避免重复展示 */

  if (response) {
    const body = truncateBody(response, MAX_RESULT_LINES);
    addCollapsibleBlock('response', 'response', '回复', body);
  }

  return blocks;
}
