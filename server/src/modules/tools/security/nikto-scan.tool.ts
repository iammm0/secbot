import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BaseTool, ToolProgressCallback, ToolResult } from '../core/base-tool';
import { spawnTerminal } from '../core/spawn-terminal';
import { resolveToolTimeout } from '../core/tool-timeouts';

export class NiktoScanTool extends BaseTool {
  constructor() {
    super(
      'nikto_scan',
      'Nikto Web 漏扫。必填 params.target（URL 或 host:port）。默认超时 600 秒，上限 1800 秒。',
    );
  }

  async run(
    params: Record<string, unknown>,
    onProgress?: ToolProgressCallback,
  ): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    if (!target) {
      return { success: false, result: null, error: '缺少必要参数: target (URL or host:port)' };
    }

    const tuning = params.tuning ? String(params.tuning).trim() : undefined;
    const plugins = params.plugins ? String(params.plugins).trim() : undefined;
    const timeoutSec = resolveToolTimeout('nikto_scan', params.timeout);
    const extraArgs = Array.isArray(params.extra_args) ? params.extra_args.map(String) : [];

    const outputDir = await mkdtemp(path.join(tmpdir(), 'secbot-nikto-'));
    const outputPath = path.join(outputDir, 'nikto.json');
    const args = ['-h', target, '-Format', 'json', '-output', outputPath, '-nointeractive'];

    if (tuning) args.push('-Tuning', tuning);
    if (plugins) args.push('-Plugins', plugins);
    args.push(...extraArgs);

    const command = `nikto ${args.join(' ')}`;
    const result = await spawnTerminal({
      command: 'nikto',
      args,
      timeoutSec,
      tool: 'nikto_scan',
      displayCommand: command,
      onProgress,
      missingMessage:
        'nikto 未安装，请执行: brew install nikto 或参考 https://github.com/sullo/nikto',
    });
    const fileText = await readFile(outputPath, 'utf8').catch(() => '');
    await rm(outputDir, { recursive: true, force: true });
    const merged = fileText.trim() || result.stdout;
    const failedWrite = /unable to open|operation not permitted/i.test(result.stderr);
    if (result.error && !merged.trim()) {
      return { success: false, result: null, error: result.error };
    }
    if ((result.code !== 0 || failedWrite) && !merged.trim()) {
      return {
        success: false,
        result: null,
        error: result.stderr.trim().slice(0, 500) || result.error || `nikto 退出码 ${result.code}`,
      };
    }

    const findings = this.parseOutput(merged);
    const payload = {
      target,
      command,
      findings_count: findings.length,
      findings,
      raw_stderr: result.stderr?.slice(0, 1000) || undefined,
    };
    if (result.error) {
      return { success: false, result: { ...payload, partial: true }, error: result.error };
    }

    return { success: true, result: payload };
  }

  private parseOutput(output: string): Array<Record<string, unknown>> {
    // nikto JSON output is an object with vulnerabilities array
    try {
      const data = JSON.parse(output);
      const vulns = data?.vulnerabilities ?? data?.host?.[0]?.items ?? [];
      return (vulns as Array<Record<string, unknown>>).map((v) => ({
        id: v.id ?? v.osvdbid ?? v.OSVDB,
        method: v.method,
        url: v.url ?? v.uri,
        description: v.msg ?? v.description,
        references: v.references ?? undefined,
      }));
    } catch {
      // fallback: try JSON-lines
      const findings: Array<Record<string, unknown>> = [];
      for (const line of output.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.vulnerabilities) {
            for (const v of obj.vulnerabilities) {
              findings.push({
                id: v.id ?? v.OSVDB,
                method: v.method,
                url: v.url,
                description: v.msg,
              });
            }
          }
        } catch {
          /* skip */
        }
      }
      if (findings.length) return findings;

      // last resort: extract from text output
      const lines = output.split('\n').filter((l) => l.includes('+ '));
      return lines.slice(0, 50).map((l) => ({ description: l.replace(/^\+\s*/, '').trim() }));
    }
  }
}
