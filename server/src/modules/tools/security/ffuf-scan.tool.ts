import { BaseTool, ToolProgressCallback, ToolResult } from '../core/base-tool';
import { spawnTerminal } from '../core/spawn-terminal';
import { resolveToolTimeout } from '../core/tool-timeouts';

export class FfufScanTool extends BaseTool {
  constructor() {
    super('ffuf_scan', 'Ffuf 目录/参数爆破。必填 params.url（含 FUZZ）。默认超时 300 秒，上限 1200 秒。');
  }

  async run(params: Record<string, unknown>, onProgress?: ToolProgressCallback): Promise<ToolResult> {
    const url = String(params.url ?? '').trim();
    if (!url) return { success: false, result: null, error: '缺少必要参数: url (含 FUZZ 占位符)' };

    const wordlist = params.wordlist ? String(params.wordlist).trim() : undefined;
    const filterStatus = params.filter_status ? String(params.filter_status).trim() : undefined;
    const filterSize = params.filter_size ? String(params.filter_size).trim() : undefined;
    const matchStatus = params.match_status
      ? String(params.match_status).trim()
      : '200,204,301,302,307,401,403';
    const threads = Math.min(Number(params.threads) || 40, 200);
    const recursion = params.recursion === true;
    const recursionDepth = Math.min(Number(params.recursion_depth) || 2, 5);
    const timeoutSec = resolveToolTimeout('ffuf_scan', params.timeout);
    const extraArgs = Array.isArray(params.extra_args) ? params.extra_args.map(String) : [];

    const args = ['-u', url, '-t', String(threads), '-json', '-noninteractive'];

    if (wordlist) {
      args.push('-w', wordlist);
    } else {
      args.push('-w', '/usr/share/wordlists/dirb/common.txt');
    }

    if (matchStatus) args.push('-mc', matchStatus);
    if (filterStatus) args.push('-fc', filterStatus);
    if (filterSize) args.push('-fs', filterSize);
    if (recursion) {
      args.push('-recursion', '-recursion-depth', String(recursionDepth));
    }
    args.push(...extraArgs);

    const command = `ffuf ${args.join(' ')}`;
    const result = await spawnTerminal({
      command: 'ffuf',
      args,
      timeoutSec,
      tool: 'ffuf_scan',
      displayCommand: command,
      onProgress,
      missingMessage: 'ffuf 未安装，请参考: https://github.com/ffuf/ffuf#installation',
    });
    const findings = this.parseJsonLines(result.stdout);
    if (result.error) {
      return {
        success: false,
        result: findings.length ? { url, command, findings_count: findings.length, findings, partial: true } : null,
        error: result.error,
      };
    }

    return {
      success: true,
      result: {
        url,
        command: `ffuf ${args.join(' ')}`,
        findings_count: findings.length,
        findings,
      },
    };
  }

  private parseJsonLines(output: string): Array<Record<string, unknown>> {
    const findings: Array<Record<string, unknown>> = [];
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.input || obj.status) {
          findings.push({
            input: obj.input?.FUZZ ?? obj.input,
            url: obj.url,
            status: obj.status,
            length: obj.length,
            words: obj.words,
            lines: obj.lines,
            content_type: obj['content-type'] ?? undefined,
            redirect_location: obj.redirectlocation ?? undefined,
          });
        }
      } catch {
        /* skip */
      }
    }
    return findings;
  }
}
