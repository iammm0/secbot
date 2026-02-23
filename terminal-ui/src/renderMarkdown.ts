/**
 * 将 Markdown 字符串渲染为终端 ANSI 字符串（供分块 MD 渲染使用）
 */
import { setOptions, parse } from 'marked';
import MarkedTerminal from 'marked-terminal';

let initialized = false;

function ensureRenderer(): void {
  if (!initialized) {
    setOptions({ renderer: new MarkedTerminal() as any });
    initialized = true;
  }
}

export function renderMarkdown(md: string): string {
  if (!md.trim()) return ' ';
  ensureRenderer();
  const out = parse(md);
  return typeof out === 'string' ? out.trim() : String(out).trim();
}
