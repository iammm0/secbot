/**
 * 将 Markdown 字符串渲染为终端 ANSI 字符串（供分块 MD 渲染使用）
 * 确保 ## 标题、** 强调 等模型输出格式正确渲染
 */
import { setOptions, parse } from 'marked';
import MarkedTerminal from 'marked-terminal';

let initialized = false;

function ensureRenderer(): void {
  if (!initialized) {
    const renderer = new (MarkedTerminal as any)({
      heading: (s: string) => `\x1b[1m\x1b[36m${s}\x1b[0m`,
      firstHeading: (s: string) => `\x1b[1m\x1b[35m${s}\x1b[0m`,
      strong: (s: string) => `\x1b[1m${s}\x1b[0m`,
    });
    setOptions({
      renderer,
      gfm: true,
      breaks: true,
    });
    initialized = true;
  }
}

export function renderMarkdown(md: string): string {
  if (!md.trim()) return ' ';
  ensureRenderer();
  const out = parse(md);
  return typeof out === 'string' ? out.trim() : String(out).trim();
}
