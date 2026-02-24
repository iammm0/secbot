/**
 * 将 StreamState 转为分块结构，每块用 Markdown 渲染
 * 推理与执行链路：API → phase → error → 规划 → 推理 → 执行 → 内容 → 报告 → 回复
 */
import type { StreamState } from './types.js';
import type { ContentBlock } from './types.js';

/** 执行结果类块最大展示行数，超出省略，避免刷屏 */
const MAX_RESULT_LINES = 24;

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

export function streamStateToBlocks(
  streamState: StreamState,
  streaming: boolean,
  apiOutput: string | null,
  /** 已“消失”的瞬时工具，不再展示在执行列表中 */
  dismissedTransientTools?: Set<string>
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let lineStart = 0;
  const { phase, detail, planning, thought, thoughtChunks, actions, content, report, error, response } = streamState;
  const dismissed = dismissedTransientTools ?? new Set<string>();

  if (apiOutput !== null) {
    const body = truncateBody(apiOutput, MAX_RESULT_LINES);
    const lineEnd = lineStart + blockLines('API', body);
    blocks.push({ id: 'api', type: 'api', title: 'API', body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  if (streaming && phase) {
    const body = detail ? `${phase}\n\n${detail}` : phase;
    const lineEnd = lineStart + blockLines(undefined, body);
    blocks.push({ id: 'phase', type: 'phase', body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  if (error) {
    const body = `**错误**\n\n${error}`;
    const lineEnd = lineStart + blockLines(undefined, body);
    blocks.push({ id: 'error', type: 'error', body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  if (planning) {
    let body = planning.content ? planning.content + '\n\n' : '';
    if (planning.todos?.length) {
      body += planning.todos.map((t) => `- ${t.content}${t.status ? ` *(${t.status})*` : ''}`).join('\n');
    }
    body = body || '规划中…';
    const lineEnd = lineStart + blockLines('规划', body);
    blocks.push({ id: 'planning', type: 'planning', title: '规划', body, lineStart, lineEnd });
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
      blocks.push({ id: 'actions', type: 'actions', title: '执行', body, lineStart, lineEnd });
      lineStart = lineEnd;
    }
  }

  if (content) {
    const lastAction = actions.length > 0 ? actions[actions.length - 1] : null;
    if (!lastAction || !TRANSIENT_TOOLS.has(lastAction.tool)) {
      const body = truncateBody(content, MAX_RESULT_LINES);
      const lineEnd = lineStart + blockLines('内容', body);
      blocks.push({ id: 'content', type: 'content', title: '内容', body, lineStart, lineEnd });
      lineStart = lineEnd;
    }
  }

  if (report) {
    const body = truncateBody(report, MAX_RESULT_LINES);
    const lineEnd = lineStart + blockLines('报告', body);
    blocks.push({ id: 'report', type: 'report', title: '报告', body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  if (response) {
    const body = truncateBody(response, MAX_RESULT_LINES);
    const lineEnd = lineStart + blockLines('回复', body);
    blocks.push({ id: 'response', type: 'response', title: '回复', body, lineStart, lineEnd });
    lineStart = lineEnd;
  }

  return blocks;
}
