import { BaseTool, ToolResult } from '../core/base-tool';

type Action = 'encode' | 'decode' | 'auto_detect';

export class EncodeDecodeTool extends BaseTool {
  constructor() {
    super(
      'encode_decode',
      'Encode/decode utility: base64, url, hex, html, unicode, rot13, binary.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const action = ((params.action as string | undefined) ?? 'encode').toLowerCase() as Action;
    const format = ((params.format as string | undefined) ?? 'base64').toLowerCase();
    const text = params.text as string | undefined;

    if (!text) {
      return { success: false, result: null, error: 'Missing parameter: text' };
    }

    try {
      if (action === 'auto_detect') {
        return { success: true, result: this.autoDetect(text) };
      }
      if (action === 'encode') {
        if (format === 'all') {
          const formats = ['base64', 'url', 'hex', 'html', 'unicode', 'rot13', 'binary'];
          const output: Record<string, string> = {};
          for (const f of formats) {
            output[f] = this.encodeOne(text, f);
          }
          return { success: true, result: { input: text, action, results: output } };
        }
        return {
          success: true,
          result: { input: text, action, format, output: this.encodeOne(text, format) },
        };
      }
      return {
        success: true,
        result: { input: text, action, format, output: this.decodeOne(text, format) },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private encodeOne(text: string, format: string): string {
    switch (format) {
      case 'base64':
        return Buffer.from(text, 'utf8').toString('base64');
      case 'url':
        return encodeURIComponent(text);
      case 'hex':
        return Buffer.from(text, 'utf8').toString('hex');
      case 'html':
        return text
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      case 'unicode':
        return text
          .split('')
          .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
          .join('');
      case 'rot13':
        return this.rot13(text);
      case 'binary':
        return Buffer.from(text, 'utf8')
          .toJSON()
          .data.map((b) => b.toString(2).padStart(8, '0'))
          .join(' ');
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private decodeOne(text: string, format: string): string {
    switch (format) {
      case 'base64':
        return Buffer.from(text, 'base64').toString('utf8');
      case 'url':
        return decodeURIComponent(text);
      case 'hex':
        return Buffer.from(text, 'hex').toString('utf8');
      case 'html':
        return text
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"')
          .replaceAll('&#39;', "'")
          .replaceAll('&amp;', '&');
      case 'unicode':
        return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
      case 'rot13':
        return this.rot13(text);
      case 'binary': {
        const bytes = text
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((b) => parseInt(b, 2));
        return Buffer.from(bytes).toString('utf8');
      }
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private autoDetect(text: string): Record<string, unknown> {
    const result: Record<string, string> = {};
    const formats = ['base64', 'url', 'hex', 'html', 'unicode'];
    for (const f of formats) {
      try {
        const decoded = this.decodeOne(text, f);
        if (decoded && decoded !== text) {
          result[f] = decoded;
        }
      } catch {
        // ignore
      }
    }
    return { input: text, detected_decodings: result };
  }

  private rot13(text: string): string {
    return text.replace(/[a-zA-Z]/g, (char) => {
      const code = char.charCodeAt(0);
      const base = code >= 97 ? 97 : 65;
      return String.fromCharCode(((code - base + 13) % 26) + base);
    });
  }
}
