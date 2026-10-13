import { describe, expect, it, vi } from 'vitest';
import type { ToolProgress } from '../../tools/core/base-tool';
import { classifyToolWait, observeToolRun } from './tool-run-watch';

describe('classifyToolWait', () => {
  it('treats a fresh wait as still running', () => {
    expect(classifyToolWait(5_000).status).toBe('running');
  });

  it('marks a quiet stretch before calling it stuck', () => {
    expect(classifyToolWait(25_000).status).toBe('quiet');
    expect(classifyToolWait(25_000).message).toContain('没有新输出');
  });

  it('marks a long silence as possibly stuck', () => {
    const waited = classifyToolWait(70_000);
    expect(waited.status).toBe('possibly_stuck');
    expect(waited.hint).toContain('卡住');
  });
});

describe('observeToolRun', () => {
  it('keeps the clock running and escalates when a tool stays silent', async () => {
    vi.useFakeTimers();
    const seen: ToolProgress[] = [];
    let finish = () => undefined as void;
    const pending = observeToolRun(
      (progress) => seen.push({ ...progress }),
      () => new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(seen[0]?.status).toBe('running');

    await vi.advanceTimersByTimeAsync(25_000);
    expect(seen.at(-1)?.status).toBe('quiet');

    await vi.advanceTimersByTimeAsync(40_000);
    expect(seen.at(-1)?.status).toBe('possibly_stuck');
    expect(seen.at(-1)?.elapsed_ms).toBeGreaterThanOrEqual(60_000);

    finish();
    await pending;
    vi.useRealTimers();
  });
});
