/**
 * 对话内搜索：在内容块上定位查询命中并注入反色高亮。
 *
 * 高亮原理：在命中文本前后包裹 ANSI 反色码（\x1B[7m / \x1B[27m）。
 * marked-terminal 会把正文里的 ANSI 序列原样透传（已实测），
 * ink Text 同样会透传到终端，因此正文与标题命中都能高亮。
 * MainContent 的宽度估算（displayWidth）会先剥掉 ANSI，布局不受影响。
 */
import type { ContentBlock } from "./types.js";

export const SEARCH_HL_ON = "\x1B[7m";
export const SEARCH_HL_OFF = "\x1B[27m";

export interface SearchMatch {
  /** 所属块 id */
  blockId: string;
  /** 是否命中标题行（标题恒为块首行） */
  inTitle: boolean;
  /** body 内相对行号（inTitle 时为 0） */
  relLine: number;
  /** 行内起始列（字符串下标） */
  colStart: number;
  /** 行内结束列（不含） */
  colEnd: number;
}

/** 块内标题行以外的 header 行数（与 MainContent.sliceBlockForVisibleRange 对齐） */
export function blockHeaderLines(block: ContentBlock): number {
  if (block.type === "user_message") return 2;
  return block.title ? 1 : 0;
}

/** 命中在 transcript 中的绝对行号（用于滚动定位） */
export function matchAbsLine(block: ContentBlock, match: SearchMatch): number {
  if (match.inTitle) return block.lineStart;
  return block.lineStart + blockHeaderLines(block) + match.relLine;
}

/** 在块列表上按出现顺序收集所有命中（大小写不敏感，单行查询） */
export function findMatches(
  blocks: ContentBlock[],
  query: string,
): SearchMatch[] {
  const q = query.trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  const out: SearchMatch[] = [];

  for (const block of blocks) {
    if (block.title && block.type !== "user_message") {
      const idx = block.title.toLowerCase().indexOf(lower);
      if (idx >= 0) {
        out.push({
          blockId: block.id,
          inTitle: true,
          relLine: 0,
          colStart: idx,
          colEnd: idx + q.length,
        });
      }
    }

    const bodyLines = (block.body || "").split("\n");
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      let from = 0;
      for (;;) {
        const idx = line.toLowerCase().indexOf(lower, from);
        if (idx < 0) break;
        out.push({
          blockId: block.id,
          inTitle: false,
          relLine: i,
          colStart: idx,
          colEnd: idx + q.length,
        });
        from = idx + q.length;
      }
    }
  }
  return out;
}

/** 单行文本（标题等）命中处包裹反色码 */
export function injectHighlight(text: string, match: SearchMatch): string {
  return (
    text.slice(0, match.colStart) +
    SEARCH_HL_ON +
    text.slice(match.colStart, match.colEnd) +
    SEARCH_HL_OFF +
    text.slice(match.colEnd)
  );
}

/** 多行 body 中按 relLine 定位到命中行并包裹反色码 */
export function injectBodyHighlight(body: string, match: SearchMatch): string {
  const lines = body.split("\n");
  let offset = 0;
  for (let i = 0; i < match.relLine && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return (
    body.slice(0, offset + match.colStart) +
    SEARCH_HL_ON +
    body.slice(offset + match.colStart, offset + match.colEnd) +
    SEARCH_HL_OFF +
    body.slice(offset + match.colEnd)
  );
}
