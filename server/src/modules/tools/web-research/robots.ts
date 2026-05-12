/**
 * 礼貌爬虫层：
 *  - robots.txt 缓存解析，按"User-agent: 通配 + 我们的 UA"组合命中规则
 *  - 单域名 RPS 限速（默认 1.5s 间隔，可被 robots Crawl-delay 抬升）
 *  - 全局 UA 常量（含 contact URL，便于站点联系）
 *
 * 设计取舍：自实现一个极简的 robots 解析器；只支持 User-agent / Allow / Disallow / Crawl-delay / Sitemap。
 * 不支持复杂的通配符/优先级匹配，但对常见站点（NVD、GitHub、Wikipedia、CWE.mitre.org 等）足够。
 */

export const RESPECTFUL_USER_AGENT =
  'secbot-ts/2.0.0 (+https://github.com/iammm0/secbot; explore-mode; contact via repo issues)';

interface RobotsRules {
  /** 命中的规则集（针对当前 UA） */
  disallow: string[];
  allow: string[];
  crawlDelaySec: number | null;
  sitemaps: string[];
  fetchedAt: number;
}

interface RobotsResult {
  allowed: boolean;
  reason: string;
  crawlDelaySec: number;
}

const ROBOTS_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MIN_INTERVAL_MS = 1_500;
const MAX_MIN_INTERVAL_MS = 8_000;

const robotsCache = new Map<string, RobotsRules | null>();
const cacheFetchedAt = new Map<string, number>();
const robotsInflight = new Map<string, Promise<RobotsRules | null>>();
const lastRequestAt = new Map<string, number>();

/**
 * 检查 URL 是否被 robots.txt 允许；若被禁止，返回 reason 描述
 * 失败/超时按"允许 + 不限速"处理（fail-open，但保留默认 RPS）
 */
export async function isAllowedByRobots(url: string): Promise<RobotsResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'URL 无法解析', crawlDelaySec: 0 };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: '仅允许 http/https', crawlDelaySec: 0 };
  }

  const origin = parsed.origin;
  const rules = await getRobotsRules(origin);
  if (!rules) {
    return { allowed: true, reason: 'robots.txt 不可达，按默认放行', crawlDelaySec: 0 };
  }

  const path = parsed.pathname + parsed.search;
  const blockedBy = matchRule(rules.disallow, path);
  if (blockedBy !== null) {
    const allowedBy = matchRule(rules.allow, path);
    if (allowedBy !== null && allowedBy.length >= blockedBy.length) {
      return { allowed: true, reason: `Allow 优先匹配: ${allowedBy}`, crawlDelaySec: rules.crawlDelaySec ?? 0 };
    }
    return { allowed: false, reason: `Disallow 匹配: ${blockedBy}`, crawlDelaySec: rules.crawlDelaySec ?? 0 };
  }
  return { allowed: true, reason: '未匹配 Disallow', crawlDelaySec: rules.crawlDelaySec ?? 0 };
}

/**
 * 单域名 RPS 限速：保证两次 fetch 之间至少间隔 minIntervalMs。
 * crawlDelaySec 来自 robots.txt 时会抬升这个间隔。
 */
export async function rateLimitWait(url: string, crawlDelaySec: number): Promise<number> {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    return 0;
  }
  const minInterval = clamp(
    Math.max(DEFAULT_MIN_INTERVAL_MS, Math.ceil(crawlDelaySec * 1000)),
    DEFAULT_MIN_INTERVAL_MS,
    MAX_MIN_INTERVAL_MS,
  );
  const last = lastRequestAt.get(host) ?? 0;
  const now = Date.now();
  const elapsed = now - last;
  if (elapsed >= minInterval) {
    lastRequestAt.set(host, now);
    return 0;
  }
  const waitMs = minInterval - elapsed;
  await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt.set(host, Date.now());
  return waitMs;
}

export function clearRobotsCache(): void {
  robotsCache.clear();
  cacheFetchedAt.clear();
  robotsInflight.clear();
}

// ------ internals ------

async function getRobotsRules(origin: string): Promise<RobotsRules | null> {
  const cached = robotsCache.get(origin);
  const fetchedAt = cacheFetchedAt.get(origin) ?? 0;
  if (cached !== undefined && Date.now() - fetchedAt < ROBOTS_CACHE_TTL_MS) {
    return cached;
  }
  const inflight = robotsInflight.get(origin);
  if (inflight) return inflight;
  const promise = fetchRobots(origin)
    .then((rules) => {
      robotsCache.set(origin, rules);
      cacheFetchedAt.set(origin, Date.now());
      return rules;
    })
    .catch(() => {
      robotsCache.set(origin, null);
      cacheFetchedAt.set(origin, Date.now());
      return null;
    })
    .finally(() => {
      robotsInflight.delete(origin);
    });
  robotsInflight.set(origin, promise);
  return promise;
}

async function fetchRobots(origin: string): Promise<RobotsRules | null> {
  const url = `${origin}/robots.txt`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': RESPECTFUL_USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return parseRobotsTxt(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseRobotsTxt(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const rulesByAgent = new Map<string, { disallow: string[]; allow: string[]; crawlDelay: number | null }>();
  const sitemaps: string[] = [];
  let currentAgents: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      currentAgents = value.split(/\s+/).filter(Boolean).map((s) => s.toLowerCase());
      for (const ua of currentAgents) {
        if (!rulesByAgent.has(ua)) {
          rulesByAgent.set(ua, { disallow: [], allow: [], crawlDelay: null });
        }
      }
      continue;
    }
    if (key === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (!currentAgents.length) continue;
    for (const ua of currentAgents) {
      const ruleset = rulesByAgent.get(ua)!;
      if (key === 'disallow') {
        if (value) ruleset.disallow.push(value);
      } else if (key === 'allow') {
        if (value) ruleset.allow.push(value);
      } else if (key === 'crawl-delay') {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) ruleset.crawlDelay = n;
      }
    }
  }

  /** 选规则集：精确匹配我们的 UA 关键字 > * 通配 */
  const lower = RESPECTFUL_USER_AGENT.toLowerCase();
  let chosen = rulesByAgent.get('secbot') || rulesByAgent.get('secbot-ts');
  if (!chosen) {
    for (const [ua, ruleset] of rulesByAgent) {
      if (ua !== '*' && lower.includes(ua)) {
        chosen = ruleset;
        break;
      }
    }
  }
  if (!chosen) chosen = rulesByAgent.get('*') ?? { disallow: [], allow: [], crawlDelay: null };

  return {
    disallow: chosen.disallow,
    allow: chosen.allow,
    crawlDelaySec: chosen.crawlDelay,
    sitemaps,
    fetchedAt: Date.now(),
  };
}

/**
 * 极简规则匹配：支持前缀匹配 + '*' 通配 + '$' 终止符。
 * 返回命中的规则字符串（用于日志），未命中则 null。
 */
function matchRule(patterns: string[], path: string): string | null {
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    /** Disallow: / 表示全站禁止 */
    if (pattern === '/') return pattern;
    /** 转成正则：转义后把 \* 替换回 .*，把结尾 $ 保留 */
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    const re = pattern.endsWith('$') ? new RegExp(`^${escaped}`) : new RegExp(`^${escaped}`);
    if (re.test(path)) return pattern;
  }
  return null;
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}
