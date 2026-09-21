import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';
import type { ChatMessage } from '../../common/types';
import type { LLMProvider } from '../../common/llm/llm.interface';
import type { ToolProgressCallback, ToolResult } from '../tools/core/base-tool';
import { recordActionAudit, summarizeForAudit } from './action-audit';

export type TraceKind = 'stage' | 'llm' | 'tool';

export interface WorkflowSpan {
  id: string;
  kind: TraceKind;
  name: string;
  detail?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: 'running' | 'ok' | 'error';
  error?: string;
  meta?: Record<string, unknown>;
}

type EmitFn = (event: string, data: Record<string, unknown>) => void;

const storage = new AsyncLocalStorage<WorkflowTracer>();
const logger = new Logger('Workflow');

const LLM_SLOW_MS = 8_000;
const TOOL_SLOW_MS = 15_000;
const STAGE_SLOW_MS = 20_000;
const HEARTBEAT_MS = 4_000;

let spanSeq = 0;

export function getWorkflowTracer(): WorkflowTracer | undefined {
  return storage.getStore();
}

export function runWithWorkflowTracer<T>(tracer: WorkflowTracer, fn: () => Promise<T>): Promise<T> {
  return storage.run(tracer, fn);
}

export class WorkflowTracer {
  readonly spans: WorkflowSpan[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private finished = false;

  constructor(
    private readonly emit: EmitFn,
    readonly sessionId: string,
    readonly agent: string = 'hackbot',
  ) {}

  start(
    kind: TraceKind,
    name: string,
    detail?: string,
    meta?: Record<string, unknown>,
  ): WorkflowSpan {
    const span: WorkflowSpan = {
      id: `span-${++spanSeq}`,
      kind,
      name,
      detail,
      startedAt: Date.now(),
      status: 'running',
      meta,
    };
    this.spans.push(span);
    logger.log(this.formatLine('START', span));
    this.emitTrace('start', span);
    this.ensureHeartbeat();
    return span;
  }

  end(span: WorkflowSpan, extra?: Record<string, unknown>): void {
    if (span.status !== 'running') return;
    span.endedAt = Date.now();
    span.durationMs = span.endedAt - span.startedAt;
    span.status = 'ok';
    if (extra) span.meta = { ...span.meta, ...extra };
    const slow = this.slowThreshold(span.kind);
    if (span.durationMs >= slow) {
      logger.warn(this.formatLine('SLOW', span));
    } else {
      logger.log(this.formatLine('END', span));
    }
    this.emitTrace('end', span);
    this.persistSpan(span);
  }

  fail(span: WorkflowSpan, error: unknown): void {
    if (span.status !== 'running') return;
    span.endedAt = Date.now();
    span.durationMs = span.endedAt - span.startedAt;
    span.status = 'error';
    span.error = error instanceof Error ? error.message : String(error);
    logger.error(this.formatLine('FAIL', span));
    this.emitTrace('end', span);
    this.persistSpan(span);
  }

  async stage<T>(name: string, fn: () => Promise<T>, detail?: string): Promise<T> {
    const span = this.start('stage', name, detail);
    try {
      const result = await fn();
      this.end(span);
      return result;
    } catch (error) {
      this.fail(span, error);
      throw error;
    }
  }

  finish(): WorkflowSpan[] {
    if (this.finished) return this.spans;
    this.finished = true;
    this.stopHeartbeat();
    const running = this.spans.filter((span) => span.status === 'running');
    for (const span of running) {
      this.fail(span, 'unfinished');
    }
    const totalMs = this.totalMs();
    const summary = this.summarize();
    logger.log(`[summary] session=${this.sessionId} total=${totalMs}ms ${summary}`);
    this.emit('workflow_summary', {
      session_id: this.sessionId,
      total_ms: totalMs,
      bottleneck: this.bottleneck(),
      bottleneck_stage: this.longestOf('stage'),
      llm_total_ms: this.sumOf('llm'),
      tool_total_ms: this.sumOf('tool'),
      llm_calls: this.spans.filter((span) => span.kind === 'llm').length,
      tool_calls: this.spans.filter((span) => span.kind === 'tool').length,
      spans: this.spans.map((span) => ({
        kind: span.kind,
        name: span.name,
        detail: span.detail,
        duration_ms: span.durationMs ?? Date.now() - span.startedAt,
        status: span.status,
        error: span.error,
      })),
    });
    return this.spans;
  }

  bottleneck(): { kind: TraceKind; name: string; duration_ms: number; detail?: string } | null {
    const leaf = this.longestOf('llm') ?? this.longestOf('tool');
    if (leaf) return leaf;
    return this.longestOf('stage');
  }

  private persistSpan(span: WorkflowSpan): void {
    const detail = span.detail ? ` · ${span.detail}` : '';
    const err = span.error ? ` · ${span.error}` : '';
    recordActionAudit({
      sessionId: this.sessionId,
      agent: this.agent,
      stepType: span.kind,
      content: `${span.kind}:${span.name}${detail} · ${span.status}${err}`,
      metadata: JSON.stringify({
        span_id: span.id,
        name: span.name,
        detail: span.detail ?? null,
        status: span.status,
        error: span.error ?? null,
        duration_ms: span.durationMs ?? null,
        meta: summarizeForAudit(span.meta ?? {}),
      }),
      timestamp: new Date(span.endedAt ?? Date.now()).toISOString(),
    });
  }

  private totalMs(): number {
    if (this.spans.length === 0) return 0;
    const start = this.spans[0].startedAt;
    const end = Math.max(...this.spans.map((span) => span.endedAt ?? Date.now()));
    return end - start;
  }

  private longestOf(
    kind: TraceKind,
  ): { kind: TraceKind; name: string; duration_ms: number; detail?: string } | null {
    const done = this.spans.filter(
      (span) => span.kind === kind && typeof span.durationMs === 'number',
    );
    if (done.length === 0) return null;
    const top = [...done].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0];
    return {
      kind: top.kind,
      name: top.name,
      duration_ms: top.durationMs ?? 0,
      detail: top.detail,
    };
  }

  private sumOf(kind: TraceKind): number {
    return this.spans
      .filter((span) => span.kind === kind)
      .reduce((sum, span) => sum + (span.durationMs ?? Date.now() - span.startedAt), 0);
  }

  private summarize(): string {
    const stages = this.spans.filter((span) => span.kind === 'stage');
    const parts = stages.map(
      (span) => `${span.name}=${span.durationMs ?? Date.now() - span.startedAt}ms`,
    );
    parts.push(
      `llm=${this.sumOf('llm')}ms/${this.spans.filter((span) => span.kind === 'llm').length}`,
    );
    parts.push(
      `tool=${this.sumOf('tool')}ms/${this.spans.filter((span) => span.kind === 'tool').length}`,
    );
    const bottleneck = this.bottleneck();
    if (bottleneck) {
      parts.push(`bottleneck=${bottleneck.kind}:${bottleneck.name}@${bottleneck.duration_ms}ms`);
    }
    return parts.join(' ');
  }

  private slowThreshold(kind: TraceKind): number {
    if (kind === 'llm') return LLM_SLOW_MS;
    if (kind === 'tool') return TOOL_SLOW_MS;
    return STAGE_SLOW_MS;
  }

  private formatLine(tag: string, span: WorkflowSpan): string {
    const elapsed = span.durationMs ?? Date.now() - span.startedAt;
    const extra = span.error ? ` error=${span.error}` : '';
    const detail = span.detail ? ` ${span.detail}` : '';
    return `[${tag}] ${span.kind}:${span.name}${detail} ${elapsed}ms${extra}`;
  }

  private emitTrace(event: 'start' | 'end' | 'heartbeat', span: WorkflowSpan): void {
    const elapsed = span.durationMs ?? Date.now() - span.startedAt;
    this.emit('workflow_trace', {
      event,
      kind: span.kind,
      name: span.name,
      detail: span.detail,
      elapsed_ms: elapsed,
      status: span.status,
      error: span.error,
    });
    if (event === 'start' || event === 'heartbeat') {
      const seconds = Math.max(1, Math.round(elapsed / 1000));
      const waiting = span.kind === 'llm' ? '模型' : span.kind === 'tool' ? '工具' : '阶段';
      this.emit('phase', {
        phase: span.kind === 'stage' ? span.name : span.kind,
        detail: `等待${waiting} · ${span.name}${span.detail ? ` · ${span.detail}` : ''} · ${seconds}s`,
        waiting: true,
        elapsed_ms: elapsed,
      });
    }
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat || this.finished) return;
    this.heartbeat = setInterval(() => {
      const running = this.spans.filter((span) => span.status === 'running');
      const current = running[running.length - 1];
      if (!current) return;
      const elapsed = Date.now() - current.startedAt;
      if (elapsed >= this.slowThreshold(current.kind)) {
        logger.warn(this.formatLine('WAIT', current));
      }
      this.emitTrace('heartbeat', current);
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}

export function wrapLlmWithTrace(inner: LLMProvider): LLMProvider {
  if ((inner as { isTraced?: boolean }).isTraced) return inner;
  const traced = new TracedLlm(inner);
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'isTraced') return true;
      if (prop === 'chat') return traced.chat.bind(traced);
      if (prop === 'chatStream') return traced.chatStream.bind(traced);
      return Reflect.get(target, prop, receiver);
    },
  }) as LLMProvider;
}

class TracedLlm implements LLMProvider {
  readonly isTraced = true;
  readonly model?: string;

  constructor(private readonly inner: LLMProvider) {
    this.model = inner.model;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    return this.traceCall('chat', messages, () => this.inner.chat(messages));
  }

  async chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<string> {
    return this.traceCall('stream', messages, () => this.inner.chatStream(messages, onChunk));
  }

  private async traceCall(
    mode: string,
    messages: ChatMessage[],
    fn: () => Promise<string>,
  ): Promise<string> {
    const tracer = getWorkflowTracer();
    if (!tracer) return fn();
    const chars = messages.reduce((sum, item) => sum + item.content.length, 0);
    const span = tracer.start('llm', mode, this.model ?? 'unknown', {
      messages: messages.length,
      chars,
    });
    try {
      const result = await fn();
      tracer.end(span, { output_chars: result.length });
      return result;
    } catch (error) {
      tracer.fail(span, error);
      throw error;
    }
  }
}

export async function traceToolRun(
  toolName: string,
  run: () => Promise<ToolResult>,
  params?: Record<string, unknown>,
): Promise<ToolResult> {
  const tracer = getWorkflowTracer();
  const span = tracer?.start('tool', toolName, undefined, {
    params: summarizeForAudit(params ?? {}),
  });
  try {
    const result = await run();
    if (span) {
      tracer?.end(span, {
        success: result.success,
        error: result.error ?? null,
        result: summarizeForAudit(result.result),
      });
    } else {
      recordActionAudit({
        sessionId: 'api',
        agent: 'tools',
        stepType: 'tool',
        content: `tool:${toolName} · ${result.success ? 'ok' : 'error'}${result.error ? ` · ${result.error}` : ''}`,
        metadata: JSON.stringify({
          name: toolName,
          status: result.success ? 'ok' : 'error',
          error: result.error ?? null,
          params: summarizeForAudit(params ?? {}),
          result: summarizeForAudit(result.result),
        }),
        timestamp: new Date().toISOString(),
      });
    }
    return result;
  } catch (error) {
    if (span) tracer?.fail(span, error);
    else {
      recordActionAudit({
        sessionId: 'api',
        agent: 'tools',
        stepType: 'tool',
        content: `tool:${toolName} · error · ${error instanceof Error ? error.message : String(error)}`,
        metadata: JSON.stringify({
          name: toolName,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          params: summarizeForAudit(params ?? {}),
        }),
        timestamp: new Date().toISOString(),
      });
    }
    throw error;
  }
}

export type { ToolProgressCallback };
