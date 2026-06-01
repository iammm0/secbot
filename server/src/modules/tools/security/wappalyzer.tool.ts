import { BaseTool, ToolResult } from '../core/base-tool';

interface TechRule {
  name: string;
  category: string;
  headers?: Record<string, RegExp>;
  cookies?: Record<string, RegExp>;
  html?: RegExp[];
  scripts?: RegExp[];
  meta?: Record<string, RegExp>;
  implies?: string[];
}

const RULES: TechRule[] = [
  // Web Servers
  { name: 'Nginx', category: 'web-server', headers: { server: /nginx/i } },
  { name: 'Apache', category: 'web-server', headers: { server: /apache/i } },
  { name: 'IIS', category: 'web-server', headers: { server: /microsoft-iis/i } },
  { name: 'LiteSpeed', category: 'web-server', headers: { server: /litespeed/i } },
  { name: 'Caddy', category: 'web-server', headers: { server: /caddy/i } },

  // Languages / Runtimes
  {
    name: 'PHP',
    category: 'language',
    headers: { 'x-powered-by': /php/i },
    cookies: { PHPSESSID: /.*/ },
  },
  {
    name: 'ASP.NET',
    category: 'language',
    headers: { 'x-powered-by': /asp\.net/i, 'x-aspnet-version': /.*/ },
    cookies: { 'ASP.NET_SessionId': /.*/ },
  },
  { name: 'Express', category: 'framework', headers: { 'x-powered-by': /express/i } },
  {
    name: 'Java',
    category: 'language',
    headers: { 'x-powered-by': /servlet|jsp|tomcat/i },
    cookies: { JSESSIONID: /.*/ },
  },
  {
    name: 'Python',
    category: 'language',
    headers: { server: /python|gunicorn|uvicorn|waitress/i },
  },

  // JS Frameworks
  {
    name: 'React',
    category: 'js-framework',
    html: [/data-reactroot|_react|__NEXT_DATA__/],
    scripts: [/react(?:\.production|\.development)/],
  },
  {
    name: 'Next.js',
    category: 'js-framework',
    html: [/__NEXT_DATA__|_next\/static/],
    headers: { 'x-powered-by': /next\.js/i },
  },
  {
    name: 'Vue.js',
    category: 'js-framework',
    html: [/data-v-[a-f0-9]|__vue__|Vue\.config/],
    scripts: [/vue(?:\.runtime)?(?:\.min)?\.js/],
  },
  { name: 'Nuxt.js', category: 'js-framework', html: [/__NUXT__|_nuxt\//] },
  { name: 'Angular', category: 'js-framework', html: [/ng-version|ng-app|angular\.(?:min\.)?js/] },
  { name: 'Svelte', category: 'js-framework', html: [/svelte-[a-z0-9]|__svelte/] },

  // CMS
  {
    name: 'WordPress',
    category: 'cms',
    html: [/wp-content|wp-includes|wp-json/],
    meta: { generator: /wordpress/i },
  },
  {
    name: 'Drupal',
    category: 'cms',
    html: [/sites\/default\/files|drupal\.js/],
    headers: { 'x-drupal-cache': /.*/, 'x-generator': /drupal/i },
  },
  {
    name: 'Joomla',
    category: 'cms',
    html: [/\/media\/jui\/|com_content/],
    meta: { generator: /joomla/i },
  },
  { name: 'Ghost', category: 'cms', html: [/ghost-(?:url|api)/], meta: { generator: /ghost/i } },
  { name: 'Shopify', category: 'ecommerce', html: [/cdn\.shopify\.com|Shopify\.theme/] },
  {
    name: 'Magento',
    category: 'ecommerce',
    html: [/mage\/cookies|Magento_Ui/],
    cookies: { frontend: /.*/ },
  },

  // CDN / Proxy
  { name: 'Cloudflare', category: 'cdn', headers: { server: /cloudflare/i, 'cf-ray': /.*/ } },
  { name: 'Fastly', category: 'cdn', headers: { 'x-served-by': /cache-/i, via: /varnish/i } },
  { name: 'AWS CloudFront', category: 'cdn', headers: { 'x-amz-cf-id': /.*/, via: /cloudfront/i } },
  { name: 'Vercel', category: 'paas', headers: { 'x-vercel-id': /.*/, server: /vercel/i } },
  { name: 'Netlify', category: 'paas', headers: { server: /netlify/i, 'x-nf-request-id': /.*/ } },

  // Security
  { name: 'ModSecurity', category: 'waf', headers: { server: /mod_security|modsecurity/i } },
  { name: 'AWS WAF', category: 'waf', headers: { 'x-amzn-waf': /.*/ } },

  // Analytics / Tag Managers
  {
    name: 'Google Analytics',
    category: 'analytics',
    html: [/google-analytics\.com\/analytics|gtag\(|UA-\d{4,10}-\d{1,4}/],
  },
  { name: 'Google Tag Manager', category: 'analytics', html: [/googletagmanager\.com\/gtm/] },

  // Misc
  { name: 'jQuery', category: 'js-library', scripts: [/jquery(?:\.min)?\.js/] },
  { name: 'Bootstrap', category: 'css-framework', html: [/bootstrap(?:\.min)?\.(?:css|js)/] },
  { name: 'Tailwind CSS', category: 'css-framework', html: [/tailwindcss|tailwind\.min\.css/] },
];

export class WappalyzerTool extends BaseTool {
  constructor() {
    super('wappalyzer', '深度技术指纹 — 基于 Wappalyzer 规则识别 Web 技术栈');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = String(params.url ?? '').trim();
    if (!url) return { success: false, result: null, error: '缺少必要参数: url' };

    const timeoutMs = Math.min(Number(params.timeout) || 15, 30) * 1000;

    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; secbot/1.0)' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });

      const headers: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });

      const cookies: Record<string, string> = {};
      const setCookie = resp.headers.get('set-cookie') ?? '';
      for (const part of setCookie.split(',')) {
        const m = part.match(/^\s*([^=]+)=([^;]*)/);
        if (m) cookies[m[1].trim()] = m[2].trim();
      }

      const body = await resp.text();
      const detected = this.detect(headers, cookies, body);

      return {
        success: true,
        result: {
          url,
          status: resp.status,
          technologies_count: detected.length,
          technologies: detected,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: `指纹识别失败: ${(error as Error).message}` };
    }
  }

  private detect(
    headers: Record<string, string>,
    cookies: Record<string, string>,
    body: string,
  ): Array<{ name: string; category: string; confidence: string }> {
    const found: Array<{ name: string; category: string; confidence: string }> = [];
    const bodyLower = body.slice(0, 200_000);

    for (const rule of RULES) {
      let matched = false;

      if (rule.headers) {
        for (const [h, re] of Object.entries(rule.headers)) {
          if (headers[h] && re.test(headers[h])) {
            matched = true;
            break;
          }
        }
      }

      if (!matched && rule.cookies) {
        for (const [c, re] of Object.entries(rule.cookies)) {
          if (cookies[c] !== undefined && re.test(cookies[c])) {
            matched = true;
            break;
          }
        }
      }

      if (!matched && rule.html) {
        for (const re of rule.html) {
          if (re.test(bodyLower)) {
            matched = true;
            break;
          }
        }
      }

      if (!matched && rule.scripts) {
        for (const re of rule.scripts) {
          if (re.test(bodyLower)) {
            matched = true;
            break;
          }
        }
      }

      if (!matched && rule.meta) {
        for (const [name, re] of Object.entries(rule.meta)) {
          const metaRe = new RegExp(
            `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`,
            'i',
          );
          const m = bodyLower.match(metaRe);
          if (m && re.test(m[1])) {
            matched = true;
            break;
          }
        }
      }

      if (matched) {
        found.push({ name: rule.name, category: rule.category, confidence: 'high' });
      }
    }

    // Version extraction for key technologies
    this.extractVersions(found, headers, bodyLower);

    return found;
  }

  private extractVersions(
    found: Array<{ name: string; category: string; confidence: string; version?: string }>,
    headers: Record<string, string>,
    body: string,
  ): void {
    for (const tech of found) {
      let version: string | undefined;

      if (tech.name === 'WordPress') {
        const m = body.match(/ver=(\d+\.\d+(?:\.\d+)?)/);
        version = m?.[1];
      } else if (tech.name === 'jQuery') {
        const m = body.match(/jquery[.-](\d+\.\d+\.\d+)/i);
        version = m?.[1];
      } else if (tech.name === 'Nginx') {
        const m = headers.server?.match(/nginx\/(\d+\.\d+(?:\.\d+)?)/i);
        version = m?.[1];
      } else if (tech.name === 'Apache') {
        const m = headers.server?.match(/apache\/(\d+\.\d+(?:\.\d+)?)/i);
        version = m?.[1];
      } else if (tech.name === 'PHP') {
        const m = headers['x-powered-by']?.match(/php\/(\d+\.\d+(?:\.\d+)?)/i);
        version = m?.[1];
      }

      if (version) (tech as Record<string, unknown>).version = version;
    }
  }
}
