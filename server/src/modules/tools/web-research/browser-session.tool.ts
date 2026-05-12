import { BaseTool, ToolResult } from '../core/base-tool';
import {
  decodeHtmlEntities,
  extractHeadings,
  extractLinks,
  extractTitle,
} from './html-utils';
import { extractReaderView } from './readability';
import { RESPECTFUL_USER_AGENT, isAllowedByRobots, rateLimitWait } from './robots';

/**
 * 一个「虚拟浏览器」工具：让 Agent 能像人一样浏览网页。
 *
 * 设计要点：
 * - 状态隔离：用 session_id（外部传入）做隔离，工具内部用 Map 维护；
 *   每次 explore 调用应当生成一个新的 session_id，结束时调 action="close" 释放。
 * - 仅 fetch + html-utils，不引 headless 浏览器；适合内容站点 / 文档 / NVD / GitHub 这种 SSR 页面。
 * - 单页过大时只把 Reader 抽取后的主体内容截断成 ~6000 字喂给 LLM，链接按 id 编号；
 *   Agent 通过 link_id 跳转，避免 LLM 自己拼写完整 URL。
 * - 防御：robots.txt 缓存检查 + 单域名 RPS 限速；每个 session 最多 25 跳；
 *   全局最多 64 个 session；闲置 30 分钟自动回收；session 内页面 LRU 缓存 16 个。
 *
 * 支持的 action：
 *   open(url)        打开一个 URL，当前页变成它
 *   search(query)    DuckDuckGo Lite 搜索，结果页可被 follow
 *   follow(link_id)  沿当前页链接跳转
 *   back()           历史回退
 *   read(section)    展开当前页某个 heading 块的正文
 *   note(content)    在 session 内记笔记（结束时返回）
 *   status()         返回当前 session 状态（不消耗 hop）
 *   close()          释放 session
 */

interface PageLink {
  id: string;
  text: string;
  url: string;
}

interface PageHeading {
  id: string;
  level: number;
  text: string;
}

interface BrowserPage {
  url: string;
  title: string;
  /** 主体内容（Reader 视图后的精简文本） */
  text: string;
  /** Reader 抽取后的字符数（用于 UI 显示压缩率） */
  rawTextLength: number;
  compressedTextLength: number;
  byline?: string;
  lang?: string;
  excerpt?: string;
  headings: PageHeading[];
  links: PageLink[];
  kind: 'page' | 'search_results';
  searchQuery?: string;
  fetchedAt: Date;
  cacheHit?: boolean;
  robotsCheck?: {
    allowed: boolean;
    reason: string;
    crawlDelaySec: number;
  };
  rateLimitedMs?: number;
}

interface BrowserState {
  history: BrowserPage[];
  notes: string[];
  hops: number;
  lastAccessedAt: number;
  /** per-session 页面 LRU 缓存 */
  pageCache: Map<string, BrowserPage>;
  pageCacheOrder: string[];
}

const MAX_HOPS_PER_SESSION = 25;
const MAX_GLOBAL_SESSIONS = 64;
const SESSION_TTL_MS = 30 * 60 * 1000;
const PAGE_TEXT_LIMIT = 6_000;
const READ_SECTION_LIMIT = 2_400;
const PAGE_CACHE_LIMIT = 16;
const DDG_LITE_URL = 'https://lite.duckduckgo.com/lite/';
const FETCH_TIMEOUT_MS = 20_000;
const VALID_ACTIONS = new Set([
  'open',
  'search',
  'follow',
  'back',
  'read',
  'note',
  'status',
  'close',
]);

interface BrowserSessionParams {
  action?: string;
  session_id?: string;
  url?: string;
  query?: string;
  max_results?: number;
  link_id?: string;
  section_id?: string;
  content?: string;
}

export class BrowserSessionTool extends BaseTool {
  private readonly sessions = new Map<string, BrowserState>();

  constructor() {
    super(
      'browser_session',
      [
        'A stateful virtual web browser. Use it like a human surfing the web.',
        'Required: { session_id: string, action: "open"|"search"|"follow"|"back"|"read"|"note"|"status"|"close", ... }',
        'Typical flow: search(query) -> open(url) or follow(link_id) -> read(section_id) -> follow another -> back() -> note(content). Finish with close().',
        'open requires url; search requires query; follow requires link_id; read requires section_id; note requires content.',
      ].join('\n'),
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const p = params as BrowserSessionParams;
    const action = (p.action ?? '').toString().trim().toLowerCase();
    const sessionId = (p.session_id ?? '').toString().trim();

    if (!action || !VALID_ACTIONS.has(action)) {
      return {
        success: false,
        result: null,
        error: `action 必须是 ${[...VALID_ACTIONS].join('|')} 之一`,
      };
    }
    if (!sessionId) {
      return { success: false, result: null, error: 'session_id 必填' };
    }

    this.gcExpiredSessions();

    if (action === 'close') {
      const closed = this.sessions.delete(sessionId);
      return {
        success: true,
        result: { closed, message: closed ? 'session 已释放' : 'session 不存在或已释放' },
      };
    }

    const state = this.getOrCreateState(sessionId);
    state.lastAccessedAt = Date.now();

    try {
      switch (action) {
        case 'open':
          return await this.handleOpen(state, p);
        case 'search':
          return await this.handleSearch(state, p);
        case 'follow':
          return await this.handleFollow(state, p);
        case 'back':
          return this.handleBack(state);
        case 'read':
          return this.handleRead(state, p);
        case 'note':
          return this.handleNote(state, p);
        case 'status':
          return this.handleStatus(state, sessionId);
        default:
          return { success: false, result: null, error: `未实现的 action: ${action}` };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, result: null, error: `browser_session 失败: ${msg}` };
    }
  }

  /** 在 ExploreAgent 结束时手动调用，确保不留 session 占内存 */
  closeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  // ------ actions ------

  private async handleOpen(state: BrowserState, p: BrowserSessionParams): Promise<ToolResult> {
    const url = (p.url ?? '').toString().trim();
    if (!/^https?:\/\//i.test(url)) {
      return { success: false, result: null, error: 'open 需要 http(s) 开头的 url 参数' };
    }
    if (state.hops >= MAX_HOPS_PER_SESSION) {
      return { success: false, result: null, error: `已达最大跳数 ${MAX_HOPS_PER_SESSION}` };
    }
    const result = await fetchOrCache(state, url);
    if (!result.ok) {
      return { success: false, result: null, error: result.error };
    }
    state.hops += 1;
    state.history.push(result.page);
    return { success: true, result: serializePageView(state, 'open') };
  }

  private async handleSearch(state: BrowserState, p: BrowserSessionParams): Promise<ToolResult> {
    const query = (p.query ?? '').toString().trim();
    if (!query) return { success: false, result: null, error: 'search 需要 query 参数' };
    if (state.hops >= MAX_HOPS_PER_SESSION) {
      return { success: false, result: null, error: `已达最大跳数 ${MAX_HOPS_PER_SESSION}` };
    }
    const maxResults = clampInt(p.max_results, 6, 1, 12);
    const page = await searchAsPage(query, maxResults);
    state.hops += 1;
    state.history.push(page);
    return { success: true, result: serializePageView(state, 'search') };
  }

  private async handleFollow(state: BrowserState, p: BrowserSessionParams): Promise<ToolResult> {
    const linkId = (p.link_id ?? '').toString().trim();
    if (!linkId) return { success: false, result: null, error: 'follow 需要 link_id 参数' };
    const current = currentPage(state);
    if (!current) return { success: false, result: null, error: '当前没有页面可点击' };
    const target = current.links.find((l) => l.id === linkId);
    if (!target) {
      return {
        success: false,
        result: null,
        error: `link_id 不存在：${linkId}，可用：${current.links.map((l) => l.id).join(',')}`,
      };
    }
    if (state.hops >= MAX_HOPS_PER_SESSION) {
      return { success: false, result: null, error: `已达最大跳数 ${MAX_HOPS_PER_SESSION}` };
    }
    const result = await fetchOrCache(state, target.url);
    if (!result.ok) {
      return { success: false, result: null, error: result.error };
    }
    state.hops += 1;
    state.history.push(result.page);
    return {
      success: true,
      result: {
        ...serializePageView(state, 'follow'),
        from_link: { id: target.id, text: target.text, url: target.url },
      },
    };
  }

  private handleBack(state: BrowserState): ToolResult {
    if (state.history.length <= 1) {
      return { success: false, result: null, error: '没有更早的历史可回退' };
    }
    state.history.pop();
    return { success: true, result: serializePageView(state, 'back') };
  }

  private handleRead(state: BrowserState, p: BrowserSessionParams): ToolResult {
    const sectionId = (p.section_id ?? '').toString().trim();
    const current = currentPage(state);
    if (!current) return { success: false, result: null, error: '当前没有页面' };
    if (!sectionId) {
      return {
        success: false,
        result: null,
        error: `read 需要 section_id；可用：${current.headings.map((h) => h.id).join(',') || '(无 heading)'}`,
      };
    }
    const idx = current.headings.findIndex((h) => h.id === sectionId);
    if (idx < 0) {
      return {
        success: false,
        result: null,
        error: `section_id 不存在：${sectionId}`,
      };
    }
    const section = extractSection(current, idx);
    return {
      success: true,
      result: {
        action: 'read',
        url: current.url,
        section_id: sectionId,
        heading: current.headings[idx],
        content: section.slice(0, READ_SECTION_LIMIT),
      },
    };
  }

  private handleNote(state: BrowserState, p: BrowserSessionParams): ToolResult {
    const content = (p.content ?? '').toString().trim();
    if (!content) return { success: false, result: null, error: 'note 需要 content 参数' };
    state.notes.push(content.slice(0, 1_000));
    return {
      success: true,
      result: {
        action: 'note',
        notes_count: state.notes.length,
        last_note: content.slice(0, 200),
      },
    };
  }

  private handleStatus(state: BrowserState, sessionId: string): ToolResult {
    const current = currentPage(state);
    return {
      success: true,
      result: {
        action: 'status',
        session_id: sessionId,
        hops: state.hops,
        max_hops: MAX_HOPS_PER_SESSION,
        history_depth: state.history.length,
        notes_count: state.notes.length,
        current: current
          ? { url: current.url, title: current.title, kind: current.kind }
          : null,
      },
    };
  }

  // ------ session management ------

  private getOrCreateState(sessionId: string): BrowserState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      this.evictIfFull();
      state = {
        history: [],
        notes: [],
        hops: 0,
        lastAccessedAt: Date.now(),
        pageCache: new Map(),
        pageCacheOrder: [],
      };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  private evictIfFull(): void {
    if (this.sessions.size < MAX_GLOBAL_SESSIONS) return;
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, s] of this.sessions) {
      if (s.lastAccessedAt < oldestAt) {
        oldestAt = s.lastAccessedAt;
        oldestId = id;
      }
    }
    if (oldestId) this.sessions.delete(oldestId);
  }

  private gcExpiredSessions(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastAccessedAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}

// ------ helpers ------

function currentPage(state: BrowserState): BrowserPage | undefined {
  return state.history[state.history.length - 1];
}

function serializePageView(state: BrowserState, action: string): Record<string, unknown> {
  const current = currentPage(state);
  if (!current) return { action, current: null };
  return {
    action,
    hops: state.hops,
    history_depth: state.history.length,
    current: {
      url: current.url,
      title: current.title,
      kind: current.kind,
      search_query: current.searchQuery,
      byline: current.byline,
      lang: current.lang,
      excerpt: current.excerpt,
      text_preview: current.text.slice(0, 1_200),
      text_length: current.text.length,
      raw_text_length: current.rawTextLength,
      compressed_text_length: current.compressedTextLength,
      headings: current.headings.map((h) => ({ id: h.id, level: h.level, text: h.text })),
      links: current.links.map((l) => ({ id: l.id, text: l.text, url: l.url })),
      cache_hit: current.cacheHit ?? false,
      robots: current.robotsCheck,
      rate_limited_ms: current.rateLimitedMs ?? 0,
    },
  };
}

function extractSection(page: BrowserPage, headingIdx: number): string {
  const lines = page.text.split('\n');
  const target = page.headings[headingIdx];
  if (!target) return '';
  /** Reader 视图把 heading 渲染成 markdown "# text"，因此用 includes 匹配 heading 文本，更稳 */
  const targetSnippet = target.text.trim();
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(targetSnippet)) {
      startLine = i;
      break;
    }
  }
  if (startLine < 0) return '';
  const nextHeading = page.headings[headingIdx + 1];
  let endLine = lines.length;
  if (nextHeading) {
    const nextSnippet = nextHeading.text.trim();
    for (let i = startLine + 1; i < lines.length; i++) {
      if (lines[i].includes(nextSnippet)) {
        endLine = i;
        break;
      }
    }
  }
  return lines.slice(startLine, endLine).join('\n');
}

interface FetchOk {
  ok: true;
  page: BrowserPage;
}
interface FetchFail {
  ok: false;
  error: string;
}
type FetchOutcome = FetchOk | FetchFail;

/** 先查会话内 LRU；未命中则走 robots.txt 检查 + 限速 + reader-view */
async function fetchOrCache(state: BrowserState, url: string): Promise<FetchOutcome> {
  const cached = state.pageCache.get(url);
  if (cached) {
    /** 把缓存项移到 LRU 末尾 */
    const idx = state.pageCacheOrder.indexOf(url);
    if (idx >= 0) state.pageCacheOrder.splice(idx, 1);
    state.pageCacheOrder.push(url);
    return { ok: true, page: { ...cached, cacheHit: true } };
  }

  const robots = await isAllowedByRobots(url);
  if (!robots.allowed) {
    return { ok: false, error: `robots.txt 禁止访问该 URL：${robots.reason}` };
  }

  const rateLimitedMs = await rateLimitWait(url, robots.crawlDelaySec);

  try {
    const html = await fetchHtml(url);
    const page = htmlToReaderPage(url, html, 'page');
    page.robotsCheck = {
      allowed: true,
      reason: robots.reason,
      crawlDelaySec: robots.crawlDelaySec,
    };
    page.rateLimitedMs = rateLimitedMs;
    cachePage(state, url, page);
    return { ok: true, page };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `fetch 失败: ${msg}` };
  }
}

function cachePage(state: BrowserState, url: string, page: BrowserPage): void {
  state.pageCache.set(url, page);
  const existingIdx = state.pageCacheOrder.indexOf(url);
  if (existingIdx >= 0) state.pageCacheOrder.splice(existingIdx, 1);
  state.pageCacheOrder.push(url);
  while (state.pageCacheOrder.length > PAGE_CACHE_LIMIT) {
    const oldest = state.pageCacheOrder.shift();
    if (oldest) state.pageCache.delete(oldest);
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': RESPECTFUL_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en;q=0.9,zh;q=0.7',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function htmlToReaderPage(
  url: string,
  html: string,
  kind: 'page' | 'search_results',
  searchQuery?: string,
): BrowserPage {
  const reader = extractReaderView(html, '');
  const text = reader.mainText.slice(0, PAGE_TEXT_LIMIT);
  const rawHeadings = extractHeadings(html, 40);
  const headings: PageHeading[] = rawHeadings.map((h, idx) => ({
    id: `h${idx + 1}`,
    level: h.level,
    text: h.text,
  }));
  const rawLinks = extractLinks(html, url, 30);
  const links: PageLink[] = rawLinks
    .map((l, idx) => ({ id: `l${idx + 1}`, text: l.text, url: l.url }))
    .filter((l) => /^https?:\/\//i.test(l.url));
  return {
    url,
    title: reader.title || extractTitle(html),
    text,
    rawTextLength: reader.rawTextLength,
    compressedTextLength: text.length,
    byline: reader.byline || undefined,
    lang: reader.lang || undefined,
    excerpt: reader.excerpt || undefined,
    headings,
    links,
    kind,
    searchQuery,
    fetchedAt: new Date(),
  };
}

async function searchAsPage(query: string, maxResults: number): Promise<BrowserPage> {
  const url = `${DDG_LITE_URL}?q=${encodeURIComponent(query)}`;
  /** DuckDuckGo Lite 一般不在 robots 屏蔽，但仍保留限速，避免连续触发反爬 */
  const robots = await isAllowedByRobots(url);
  const rateLimitedMs = await rateLimitWait(url, robots.crawlDelaySec);
  const html = await fetchHtml(url);
  const items = parseDuckDuckGoLite(html, maxResults);
  const text =
    items.length === 0
      ? '（无搜索结果）'
      : items
          .map(
            (item, i) =>
              `${i + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet.slice(0, 240)}`,
          )
          .join('\n\n');
  const links: PageLink[] = items.map((item, i) => ({
    id: `l${i + 1}`,
    text: item.title.slice(0, 100) || item.url,
    url: item.url,
  }));
  return {
    url,
    title: `搜索: ${query}`,
    text,
    rawTextLength: text.length,
    compressedTextLength: text.length,
    headings: [],
    links,
    kind: 'search_results',
    searchQuery: query,
    fetchedAt: new Date(),
    robotsCheck: {
      allowed: robots.allowed,
      reason: robots.reason,
      crawlDelaySec: robots.crawlDelaySec,
    },
    rateLimitedMs,
  };
}

interface DuckDuckGoResult {
  title: string;
  url: string;
  snippet: string;
}

function parseDuckDuckGoLite(html: string, maxResults: number): DuckDuckGoResult[] {
  const linkRegex = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  const links: Array<{ url: string; title: string }> = [];
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null && links.length < maxResults) {
    const rawUrl = String(linkMatch[1] ?? '').trim();
    if (!/^https?:\/\//i.test(rawUrl)) continue;
    const title = decodeHtmlEntities(
      String(linkMatch[2] ?? '').replace(/<[^>]+>/g, ''),
    )
      .trim()
      .slice(0, 280);
    links.push({ url: rawUrl, title });
  }
  const snippets: string[] = [];
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(
      decodeHtmlEntities(String(snippetMatch[1] ?? '').replace(/<[^>]+>/g, ''))
        .trim()
        .slice(0, 320),
    );
  }
  return links.map((entry, idx) => ({
    title: entry.title,
    url: entry.url,
    snippet: snippets[idx] ?? '',
  }));
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
