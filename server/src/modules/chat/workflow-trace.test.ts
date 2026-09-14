import { describe, expect, it, vi } from 'vitest';
import { runWithWorkflowTracer, WorkflowTracer, wrapLlmWithTrace } from './workflow-trace';

describe('WorkflowTracer', () => {
  it('records stage durations and bottleneck', async () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    const tracer = new WorkflowTracer((event, data) => events.push({ event, data }), 's1');
    await runWithWorkflowTracer(tracer, async () => {
      await tracer.stage('classify', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      await tracer.stage('execute', async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
    });
    const spans = tracer.finish();
    expect(spans.map((span) => span.name)).toEqual(['classify', 'execute']);
    expect(spans.every((span) => span.status === 'ok')).toBe(true);
    const bottleneck = tracer.bottleneck();
    expect(bottleneck?.name).toBe('execute');
    expect(events.some((item) => item.event === 'workflow_summary')).toBe(true);
  });

  it('prefers the longest LLM/tool span over wrapping stages', async () => {
    const inner = {
      model: 'test-model',
      chat: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return 'ok';
      }),
      chatStream: vi.fn(),
    };
    const llm = wrapLlmWithTrace(inner);
    const tracer = new WorkflowTracer(() => undefined, 's-leaf');
    await runWithWorkflowTracer(tracer, async () => {
      await tracer.stage('classify', async () => {
        await llm.chat([{ role: 'user', content: 'hi' }]);
      });
    });
    tracer.finish();
    expect(tracer.bottleneck()?.kind).toBe('llm');
    expect(tracer.bottleneck()?.name).toBe('chat');
  });

  it('wraps LLM chat when a tracer is active', async () => {
    const inner = {
      model: 'test-model',
      chat: vi.fn().mockResolvedValue('ok'),
      chatStream: vi.fn(),
    };
    const llm = wrapLlmWithTrace(inner);
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    const tracer = new WorkflowTracer((event, data) => events.push({ event, data }), 's2');
    await runWithWorkflowTracer(tracer, async () => {
      await llm.chat([{ role: 'user', content: 'hi' }]);
    });
    tracer.finish();
    expect(inner.chat).toHaveBeenCalledTimes(1);
    expect(events.some((item) => item.event === 'workflow_trace' && item.data.kind === 'llm')).toBe(
      true,
    );
  });
});
