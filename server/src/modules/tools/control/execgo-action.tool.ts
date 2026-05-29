import { randomUUID } from 'node:crypto';
import { BaseTool, ToolResult } from '../core/base-tool';
import { ExecGoActionRequest, ExecGoClient } from './execgo-client.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => String(item)).filter(Boolean);
}

function stableActionId(prefix = 'secbot-execgo'): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export class ExecGoActionTool extends BaseTool {
  private readonly client = new ExecGoClient();

  constructor() {
    super(
      'execgo_action',
      'Run ExecGo control-plane actions: health, tools, os.noop, os.shell, runtime.command, runtime.script, mcp.call, cli.run, or task_graph.submit.',
      true,
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const mode = String(params.mode ?? 'act')
      .trim()
      .toLowerCase();
    const timeoutMs = Math.max(1, Number(params.timeout_ms ?? 60_000));

    try {
      if (mode === 'health') {
        return { success: true, result: await this.client.health(timeoutMs) };
      }
      if (mode === 'tools') {
        return { success: true, result: await this.client.tools(timeoutMs) };
      }

      const kind = String(params.kind ?? params.action_kind ?? 'os.noop').trim();
      const actionId = String(
        params.action_id ?? stableActionId(kind.replace(/[^a-z0-9]+/gi, '-')),
      ).trim();
      const wait = params.wait === undefined ? true : Boolean(params.wait);
      const request: ExecGoActionRequest = {
        adapter: String(params.adapter ?? 'secbot'),
        agent_id: String(params.agent_id ?? process.env.SECBOT_EXECGO_AGENT_ID ?? 'secbot-backend'),
        session_id: String(
          params.session_id ?? process.env.SECBOT_EXECGO_SESSION_ID ?? 'secbot-session',
        ),
        action_id: actionId,
        action: {
          kind,
          input: asRecord(params.input),
          depends_on: asStringArray(params.depends_on),
          retry: params.retry === undefined ? undefined : Number(params.retry),
          timeout:
            params.action_timeout_ms === undefined ? undefined : Number(params.action_timeout_ms),
        },
        metadata: {
          source: 'secbot',
          tool: 'execgo_action',
          ...asRecord(params.metadata),
        },
      };

      const result = wait
        ? await this.client.actAndWait(request, timeoutMs)
        : await this.client.act(request, timeoutMs);

      return {
        success: true,
        result: {
          action_id: actionId,
          waited: wait,
          ...result,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: (error as Error).message,
      };
    }
  }
}
