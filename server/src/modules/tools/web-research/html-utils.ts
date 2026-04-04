const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

export type LinkItem = { text: string; url: string };
export type ImageItem = { alt: string; src: string };

function decodeEntity(entity: string): string {
  if (ENTITY_MAP[entity]) return ENTITY_MAP[entity];
  if (/^&#\d+;$/.test(entity)) {
    const code = Number(entity.slice(2, -1));
    return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
  }
  if (/^&#x[0-9a-f]+;$/i.test(entity)) {
    const code = Number.parseInt(entity.slice(3, -1), 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
  }
  return entity;
}

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(?:amp|lt|gt|quot|#39|nbsp);|&#\d+;|&#x[0-9a-f]+;/gi, (entity) =>
    decodeEntity(entity),
  );
}

export function stripTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ' '));
}

export function normalizeText(input: string): string {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.join('\n');
}

export function cleanHtmlToText(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ');

  const text = stripTags(cleaned)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return normalizeText(text);
}

export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]).slice(0, 500) : '';
}

function safeAbsoluteUrl(raw: string, baseUrl?: string): string {
  const candidate = raw.trim();
  if (!candidate) return '';
  if (/^(javascript:|mailto:|tel:|#)/i.test(candidate)) return '';
  try {
    if (baseUrl) {
      return new URL(candidate, baseUrl).toString();
    }
    return new URL(candidate).toString();
  } catch {
    return '';
  }
}

export function extractLinks(html: string, baseUrl?: string, limit = 20): LinkItem[] {
  const links: LinkItem[] = [];
  const seen = new Set<string>();
  const regex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null && links.length < limit) {
    const href = safeAbsoluteUrl(match[1], baseUrl);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const text = stripTags(match[2]).trim().slice(0, 100);
    if (!text) continue;
    links.push({ text, url: href });
  }

  return links;
}

export function extractImages(html: string, baseUrl?: string, limit = 10): ImageItem[] {
  const images: ImageItem[] = [];
  const seen = new Set<string>();
  const regex = /<img\b([^>]*?)>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null && images.length < limit) {
    const attrs = match[1];
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = safeAbsoluteUrl(srcMatch[1], baseUrl);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const alt = stripTags((attrs.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').trim()).slice(
      0,
      100,
    );
    images.push({ alt, src });
  }
  return images;
}

export function extractHeadings(html: string, limit = 50): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  const regex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null && headings.length < limit) {
    const level = Number(match[1]);
    const text = stripTags(match[2]).trim();
    if (!text) continue;
    headings.push({ level, text: text.slice(0, 200) });
  }

  return headings;
}

export function extractTables(
  html: string,
  tableLimit = 10,
): Array<{ rows: string[][]; total_rows: number }> {
  const tables: Array<{ rows: string[][]; total_rows: number }> = [];
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRegex.exec(html)) !== null && tables.length < tableLimit) {
    const tableHtml = tableMatch[1];
    const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[][] = [];
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null && rows.length < 50) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const text = stripTags(cellMatch[1]).trim();
        if (text) cells.push(text.slice(0, 200));
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length > 0) {
      tables.push({ rows, total_rows: rows.length });
    }
  }

  return tables;
}

export function extractLists(
  html: string,
  limit = 20,
): Array<{ type: 'ul' | 'ol'; items: string[]; total_items: number }> {
  const lists: Array<{ type: 'ul' | 'ol'; items: string[]; total_items: number }> = [];
  const listRegex = /<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let listMatch: RegExpExecArray | null;

  while ((listMatch = listRegex.exec(html)) !== null && lists.length < limit) {
    const type = listMatch[1].toLowerCase() as 'ul' | 'ol';
    const listHtml = listMatch[2];
    const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    const items: string[] = [];
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRegex.exec(listHtml)) !== null && items.length < 30) {
      const text = stripTags(liMatch[1]).trim();
      if (text) items.push(text.slice(0, 300));
    }
    if (items.length > 0) {
      lists.push({ type, items, total_items: items.length });
    }
  }

  return lists;
}

export function extractMetaTags(html: string, limit = 20): Record<string, string> {
  const meta: Record<string, string> = {};
  const regex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[0];
    const key =
      tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bproperty\s*=\s*["']([^"']+)["']/i)?.[1];
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    if (!key || !content) continue;
    if (!(key in meta)) {
      meta[key] = decodeHtmlEntities(content).slice(0, 500);
      if (Object.keys(meta).length >= limit) break;
    }
  }
  return meta;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractContainer(html: string, pattern: RegExp): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

export function applySimpleSelector(html: string, selector?: string): string {
  if (!selector) return html;
  const s = selector.trim();
  if (!s) return html;

  if (/^[a-z][a-z0-9-]*$/i.test(s)) {
    const blocks = extractContainer(html, new RegExp(`<${s}\\b[^>]*>[\\s\\S]*?<\\/${s}>`, 'gi'));
    return blocks.length > 0 ? blocks.join('\n') : html;
  }

  if (/^#[a-zA-Z0-9\-_]+$/.test(s)) {
    const id = escapeRegex(s.slice(1));
    const blocks = extractContainer(
      html,
      new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/\\1>`, 'gi'),
    );
    return blocks.length > 0 ? blocks.join('\n') : html;
  }

  if (/^\.[a-zA-Z0-9\-_]+$/.test(s)) {
    const cls = escapeRegex(s.slice(1));
    const blocks = extractContainer(
      html,
      new RegExp(
        `<([a-z0-9]+)\\b[^>]*\\bclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`,
        'gi',
      ),
    );
    return blocks.length > 0 ? blocks.join('\n') : html;
  }

  return html;
}

export function normalizeUrlForVisit(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    let normalized = u.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.trim();
  }
}
