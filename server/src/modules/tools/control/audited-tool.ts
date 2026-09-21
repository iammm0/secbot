import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { BaseTool, ToolProgressCallback, ToolResult } from '../core/base-tool';
import { ExecGoClient } from './execgo-client.js';
import { getExecGoRuntimeConfig } from './execgo-config.js';

/**
 * Wraps a tool so each invocation is audited through ExecGo when enabled.
 * Execution still happens locally (or via the tool's own ExecGo path for shell).
 */
export class AuditedTool extends BaseTool {
  private readonly logger: Logger;
  private readonly client = new ExecGoClient();

  constructor(private readonly inner: BaseTool) {
    super(inner.name, inner.description, inner.sensitive);
    this.logger = new Logger(`AuditedTool:${inner.name}`);
  }

  async run(
    params: Record<string, unknown>,
    onProgress?: ToolProgressCallback,
  ): Promise<ToolResult> {
    const config = getExecGoRuntimeConfig();
    const shouldAudit = config.enabled && config.auditActions && this.inner.name !== 'execgo_action';
    const started = Date.now();

    if (shouldAudit) {
      void this.audit('before', params, null, 0).catch((err) => {
        this.logger.warn(`ExecGo audit(before) failed: ${(err as Error).message}`);
      });
    }

    try {
      const result = await this.inner.run(params, onProgress);
      if (shouldAudit) {
        void this.audit('after', params, result, Date.now() - started).catch((err) => {
          this.logger.warn(`ExecGo audit(after) failed: ${(err as Error).message}`);
        });
      }
      return result;
    } catch (error) {
      if (shouldAudit) {
        void this.audit(
          'error',
          params,
          {
            success: false,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          },
          Date.now() - started,
        ).catch(() => undefined);
      }
      throw error;
    }
  }

  private async audit(
    phase: 'before' | 'after' | 'error',
    params: Record<string, unknown>,
    result: ToolResult | null,
    elapsedMs: number,
  ): Promise<void> {
    const actionId = `secbot-audit-${this.inner.name}-${Date.now()}-${randomUUID().slice(0, 6)}`;
    await this.client.act(
      {
        adapter: 'secbot',
        agent_id: process.env.SECBOT_EXECGO_AGENT_ID || 'secbot-backend',
        session_id: process.env.SECBOT_EXECGO_SESSION_ID || 'secbot-session',
        action_id: actionId,
        action: {
          kind: 'os.noop',
          input: {
            message: `secbot.audit.${phase}:${this.inner.name}`,
          },
          timeout: 5_000,
        },
        metadata: {
          source: 'secbot',
          plugin: 'execgo',
          audit: true,
          phase,
          tool: this.inner.name,
          sensitive: this.inner.sensitive,
          params: summarizeParams(params),
          success: result?.success ?? null,
          error: result?.error ?? null,
          elapsed_ms: elapsedMs,
        },
      },
      8_000,
    );
  }
}

export function wrapToolsForExecGoAudit(tools: BaseTool[]): BaseTool[] {
  return tools.map((tool) => (tool instanceof AuditedTool ? tool : new AuditedTool(tool)));
}

function summarizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === 'string') {
      out[key] = value.length > 240 ? `${value.slice(0, 240)}…` : value;
    } else if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
      out[key] = value;
    } else {
      try {
        const raw = JSON.stringify(value);
        out[key] = raw.length > 240 ? `${raw.slice(0, 240)}…` : JSON.parse(raw);
      } catch {
        out[key] = String(value);
      }
    }
  }
  return out;
}
