import { BaseTool, ToolProgressCallback, ToolResult } from '../core/base-tool';
import { spawnTerminal } from '../core/spawn-terminal';
import { stringList } from '../core/tool-params';
import { resolveToolTimeout } from '../core/tool-timeouts';

export class NucleiScanTool extends BaseTool {
  constructor() {
    super(
      'nuclei_scan',
      'Nuclei 模板扫描。必填 params.target，或 params.targets 字符串数组。默认超时 1200 秒，上限 3600 秒。',
    );
  }

  async run(params: Record<string, unknown>, onProgress?: ToolProgressCallback): Promise<ToolResult> {
    const targets = stringList(params, ['target', 'targets', 'url']);
    if (targets.length === 0) {
      return { success: false, result: null, error: '缺少必要参数: target（也接受 targets 数组）' };
    }

    const templates = params.templates ? String(params.templates).trim() : undefined;
    const severity = params.severity ? String(params.severity).trim() : undefined;
    const tags = params.tags ? String(params.tags).trim() : undefined;
    const timeoutSec = resolveToolTimeout('nuclei_scan', params.timeout);
    const extraArgs = Array.isArray(params.extra_args) ? params.extra_args.map(String) : [];

    const args = ['-jsonl', '-no-color', '-stats', '-si', '5', ...targets.flatMap((item) => ['-target', item])];

    if (templates) args.push('-t', templates);
    if (severity) args.push('-severity', severity);
    if (tags) args.push('-tags', tags);
    args.push(...extraArgs);

    const command = `nuclei ${args.join(' ')}`;
    const result = await spawnTerminal({
      command: 'nuclei',
      args,
      timeoutSec,
      tool: 'nuclei_scan',
      displayCommand: command,
      onProgress,
      missingMessage: 'nuclei 未安装，请参考: https://github.com/projectdiscovery/nuclei#install',
    });
    const findings = this.parseJsonLines(result.stdout);
    if (result.error) {
      return {
        success: false,
        result: findings.length
          ? { target: targets[0], targets, command, findings_count: findings.length, findings, partial: true }
          : null,
        error: result.error,
      };
    }

    return {
      success: true,
      result: {
        target: targets[0],
        targets,
        command: `nuclei ${args.join(' ')}`,
        findings_count: findings.length,
        findings,
        raw_stderr: result.stderr?.slice(0, 1000) || undefined,
      },
    };
  }

  private parseJsonLines(output: string): Array<Record<string, unknown>> {
    const findings: Array<Record<string, unknown>> = [];
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        findings.push({
          template_id: obj['template-id'] ?? obj.templateID,
          name: obj.info?.name ?? obj.name,
          severity: obj.info?.severity ?? obj.severity,
          type: obj.type,
          host: obj.host,
          matched_at: obj['matched-at'] ?? obj.matchedAt,
          extracted_results: obj['extracted-results'] ?? undefined,
          curl_command: obj['curl-command'] ?? undefined,
          description: obj.info?.description?.slice(0, 300) ?? undefined,
          tags: obj.info?.tags ?? undefined,
          reference: obj.info?.reference?.slice(0, 5) ?? undefined,
          matcher_name: obj['matcher-name'] ?? undefined,
        });
      } catch {
        // skip non-JSON lines
      }
    }
    return findings;
  }
}
