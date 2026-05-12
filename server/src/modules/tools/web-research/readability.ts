/**
 * 轻量主体内容抽取（Readability/Mercury 思路的精简版）。
 *
 * 目标：从 HTML 中尽量去掉导航、侧边栏、广告、相关推荐，
 * 留下"读者真正想看的正文 + 段落标题"。
 *
 * 不引入第三方依赖；对 SSR 渲染的内容站点（文档、博客、CVE 详情页、Github README）效果最好。
 * 对 SPA（极依赖 JS 渲染）效果有限——这种情况下 ExploreAgent 可以退回到 page_extract。
 *
 * 输出：
 *  - title：页面标题
 *  - byline：作者/署名（尽力抽取，可能为空）
 *  - lang：页面语言
 *  - mainText：清洗后的主体文本（分段、保留标题层级标记）
 *  - excerpt：前若干字符的摘要
 *  - rawTextLength：原始 cleanHtmlToText 后的总字符数（用于 UI 显示压缩率）
 */

import { cleanHtmlToText, decodeHtmlEntities, extractTitle } from './html-utils';

export interface ReaderViewResult {
  title: string;
  byline: string;
  lang: string;
  mainText: string;
  excerpt: string;
  rawTextLength: number;
  compressedTextLength: number;
}

/** 候选容器：score 越高越像正文 */
interface Candidate {
  html: string;
  text: string;
  /** 节点字面标签名（粗略，只为区分常见正文容器） */
  tag: string;
  /** 总文本长度 */
  textLen: number;
  /** 含有的段落 <p> 数量 */
  paragraphs: number;
  /** 含有的链接文本占比 0-1（越高越像导航） */
  linkRatio: number;
  /** 含有 <h1>-<h3> 数量 */
  headings: number;
  /** 复合分数 */
  score: number;
}

/** 倾向作为正文容器的 tag / id / class 关键词 */
const POSITIVE_HINTS = [
  'article',
  'main',
  'content',
  'post',
  'entry',
  'markdown',
  'readme',
  'body',
  'story',
];
const NEGATIVE_HINTS = [
  'comment',
  'meta-',
  'footer',
  'footnote',
  'foot',
  'sidebar',
  'sponsor',
  'ad',
  'social',
  'related',
  'recommend',
  'breadcrumbs',
  'nav',
];

const CONTAINER_REGEX =
  /<(article|main|section|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

export function extractReaderView(html: string, fallbackTitle = ''): ReaderViewResult {
  const title = extractTitle(html) || fallbackTitle;
  const byline = extractByline(html);
  const lang = extractLang(html);
  const rawText = cleanHtmlToText(html);
  const rawTextLength = rawText.length;

  /** 短页面直接返回原文：不值得 Reader 抽取 */
  if (rawTextLength < 600) {
    const mainText = rawText.trim();
    return {
      title,
      byline,
      lang,
      mainText,
      excerpt: makeExcerpt(mainText),
      rawTextLength,
      compressedTextLength: mainText.length,
    };
  }

  /** 1) 全文先做"明显噪声段落剔除"，得到 stripped */
  const stripped = preStripNoise(html);

  /** 2) 收集候选容器（article/main/section/div），打分排序 */
  const candidates = collectCandidates(stripped);

  if (candidates.length === 0) {
    /** 没有像样的容器：退回到全局 cleanHtmlToText */
    const mainText = cleanHtmlToText(stripped).trim();
    return {
      title,
      byline,
      lang,
      mainText,
      excerpt: makeExcerpt(mainText),
      rawTextLength,
      compressedTextLength: mainText.length,
    };
  }

  /** 3) 选 top1 候选 */
  const top = candidates.reduce((a, b) => (a.score >= b.score ? a : b));
  const mainText = postCleanMainText(top.html);

  return {
    title,
    byline,
    lang,
    mainText,
    excerpt: makeExcerpt(mainText),
    rawTextLength,
    compressedTextLength: mainText.length,
  };
}

// ------ helpers ------

function preStripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<form\b[\s\S]*?<\/form>/gi, ' ')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, ' ');
}

function collectCandidates(html: string): Candidate[] {
  const candidates: Candidate[] = [];
  CONTAINER_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONTAINER_REGEX.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    const inner = m[3] || '';
    /** 跳过过短的容器 */
    const innerText = cleanHtmlToText(inner);
    if (innerText.length < 200) continue;
    const score = scoreCandidate(tag, attrs, inner, innerText);
    /** 过低分数说明这个容器更像噪声，不收 */
    if (score <= 0) continue;
    candidates.push({
      html: inner,
      text: innerText,
      tag,
      textLen: innerText.length,
      paragraphs: countMatches(inner, /<p\b/gi),
      linkRatio: linkTextRatio(inner, innerText),
      headings: countMatches(inner, /<h[1-3]\b/gi),
      score,
    });
    if (candidates.length >= 80) break;
  }
  return candidates;
}

function scoreCandidate(
  tag: string,
  attrs: string,
  innerHtml: string,
  innerText: string,
): number {
  let score = 0;
  if (tag === 'article') score += 30;
  if (tag === 'main') score += 20;
  if (tag === 'section') score += 5;

  const attrStr = attrs.toLowerCase();
  for (const k of POSITIVE_HINTS) if (attrStr.includes(k)) score += 10;
  for (const k of NEGATIVE_HINTS) if (attrStr.includes(k)) score -= 25;

  const len = innerText.length;
  score += Math.min(50, Math.floor(len / 200));
  score += Math.min(20, countMatches(innerHtml, /<p\b/gi));
  score += Math.min(10, countMatches(innerHtml, /<h[1-3]\b/gi) * 3);

  const linkRatio = linkTextRatio(innerHtml, innerText);
  /** 链接占比过高基本是导航/列表 */
  if (linkRatio > 0.5) score -= 30;
  else if (linkRatio > 0.3) score -= 10;

  return score;
}

function postCleanMainText(html: string): string {
  /** 1) 把 <h1>-<h6> 改成 markdown 风格保留层级，便于 reader-view 输出 */
  let s = html.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, lvl, body) => {
    const hashes = '#'.repeat(Math.min(6, Math.max(1, Number(lvl))));
    return `\n\n${hashes} ${stripInner(body).trim()}\n\n`;
  });
  /** 2) 列表项前加 - */
  s = s.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, body) => `\n- ${stripInner(body).trim()}`);
  /** 3) p / br / blockquote 换行 */
  s = s.replace(/<\/p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, body) => {
    return stripInner(body)
      .split('\n')
      .map((line) => (line.trim() ? `> ${line.trim()}` : ''))
      .join('\n');
  });
  /** 4) 最后一次清理 */
  const text = stripInner(s)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function stripInner(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ''));
}

function linkTextRatio(html: string, plainText: string): number {
  if (!plainText) return 0;
  let linkText = '';
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    linkText += ' ' + stripInner(m[1]);
  }
  const linkLen = linkText.replace(/\s+/g, ' ').trim().length;
  return Math.min(1, linkLen / Math.max(1, plainText.length));
}

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0;
  let count = 0;
  while (re.exec(text) !== null) count++;
  return count;
}

function extractByline(html: string): string {
  const metaAuthor = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i);
  if (metaAuthor) return decodeHtmlEntities(metaAuthor[1]).trim().slice(0, 120);
  const rel = html.match(/<a\b[^>]*rel=["']author["'][^>]*>([\s\S]*?)<\/a>/i);
  if (rel) return stripInner(rel[1]).trim().slice(0, 120);
  return '';
}

function extractLang(html: string): string {
  const m = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i);
  return m ? m[1].trim().toLowerCase().slice(0, 24) : '';
}

function makeExcerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.slice(0, 300);
}
