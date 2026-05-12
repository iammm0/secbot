/**
 * 将 Markdown 字符串渲染为终端 ANSI 字符串。
 *
 * 适配说明：
 *  - marked v9+ 与 marked-terminal v6+ 已将「自定义 renderer」改成「marked 扩展」
 *    （`marked.use(markedTerminal(opts))`）。旧的 `new MarkedTerminal({...})`
 *    + `setOptions({renderer})` 写法在新版会**静默退化为原始 markdown**，
 *    这是之前最终总结/报告块出现「## 摘要」原文的原因。
 *  - 这里改用扩展 API，并显式关闭 section 前缀（`showSectionPrefix`），
 *    避免渲染出来的 heading 仍然带 `## `。
 *  - 用 `marked.parse(md)`，marked v9 默认同步。
 */
import { marked } from 'marked';
import * as MarkedTerminalModule from 'marked-terminal';

let initialized = false;

/** marked-terminal v6 暴露的扩展工厂；类型未导出，运行时存在 */
type MarkedTerminalFactory = (options?: Record<string, unknown>) => unknown;

function resolveMarkedTerminalFactory(): MarkedTerminalFactory {
  const mod = MarkedTerminalModule as unknown as {
    markedTerminal?: MarkedTerminalFactory;
    default?: MarkedTerminalFactory;
  };
  /** v6.x 提供 named export `markedTerminal`；某些打包工具会把它放到 default */
  return mod.markedTerminal ?? mod.default ?? (MarkedTerminalModule as unknown as MarkedTerminalFactory);
}

function ensureRenderer(): void {
  if (initialized) return;
  const factory = resolveMarkedTerminalFactory();
  /** marked-terminal 默认 renderer 已经会染色（chalk）；只覆盖与终端窄屏适配相关的选项 */
  marked.use(
    factory({
      showSectionPrefix: false,
      reflowText: false,
      tab: 2,
      unescape: true,
    }) as Parameters<typeof marked.use>[0],
  );
  initialized = true;
}

export function renderMarkdown(md: string): string {
  if (!md.trim()) return ' ';
  ensureRenderer();
  try {
    const out = marked.parse(md);
    return typeof out === 'string' ? out.trim() : String(out).trim();
  } catch {
    /** 渲染失败时退回原文，比抛错更友好 */
    return md;
  }
}
