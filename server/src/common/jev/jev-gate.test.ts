import { describe, expect, it, vi } from 'vitest';
import {
  acceptChoice,
  classifyIntentWithJev,
  filterContextSnippetsWithJev,
  noulDecisionConfidence,
  shouldNudgeReactStop,
  shouldRetrieveLiveWithJev,
  shouldSkipAdaptiveReplan,
} from './jev-gate';
import type { JevClient, JevSystemOneResponse } from './jev.client';
import type { JevRuntimeConfig } from './jev-config';

const enabled: JevRuntimeConfig = {
  enabled: true,
  intent: true,
  qaLive: true,
  adaptive: true,
  reactStop: true,
  context: true,
  apiKey: 'sk-test',
  baseUrl: 'https://api.typesafe.ai',
  model: 'jev-latest',
  confidenceMin: 0.85,
  reactStopMin: 0.92,
};

function mockClient(answers: JevSystemOneResponse['answers']): JevClient {
  return {
    systemOne: vi.fn().mockResolvedValue({ model: 'jev-latest', answers }),
  } as unknown as JevClient;
}

describe('jev-gate', () => {
  it('accepts a high-confidence choice and rejects a low one', () => {
    expect(
      acceptChoice({ type: 'choice', choice: 'qa', probabilities: { qa: 0.9 }, confidence: 0.9 }, 0.85),
    ).toBe('qa');
    expect(
      acceptChoice({ type: 'choice', choice: 'qa', probabilities: { qa: 0.5 }, confidence: 0.4 }, 0.85),
    ).toBeNull();
  });

  it('treats noul confidence as distance from 0.5', () => {
    expect(noulDecisionConfidence(0.12)).toBeCloseTo(0.88);
    expect(noulDecisionConfidence(0.97)).toBeCloseTo(0.97);
  });

  it('classifies intent when choice confidence is high', async () => {
    const client = mockClient({
      intent: {
        type: 'choice',
        choice: 'task_simple',
        probabilities: { task_simple: 0.94 },
        confidence: 0.94,
      },
      needs_explore: { type: 'noul', noul: 0.08 },
      needs_report: { type: 'noul', noul: 0.1 },
    });
    const result = await classifyIntentWithJev('再扫一遍 10.0.0.8', client, enabled);
    expect(result?.intent).toBe('task_simple');
    expect(result?.needsExplore).toBe(false);
    expect(result?.needsReport).toBe(false);
  });

  it('falls back for live QA when noul is in the uncertain band', async () => {
    const client = mockClient({ live: { type: 'noul', noul: 0.5 } });
    await expect(shouldRetrieveLiveWithJev('最近怎么样', client, enabled)).resolves.toBeNull();
  });

  it('retrieves live QA when noul is clearly yes', async () => {
    const client = mockClient({ live: { type: 'noul', noul: 0.88 } });
    await expect(shouldRetrieveLiveWithJev('最新零日', client, enabled)).resolves.toBe(true);
  });

  it('skips adaptive replan only when noul is a confident no', async () => {
    const skipClient = mockClient({ worth_replan: { type: 'noul', noul: 0.08 } });
    await expect(shouldSkipAdaptiveReplan('failed nmap', 2, skipClient, enabled)).resolves.toBe(
      true,
    );
    const keepClient = mockClient({ worth_replan: { type: 'noul', noul: 0.4 } });
    await expect(shouldSkipAdaptiveReplan('failed nmap', 2, keepClient, enabled)).resolves.toBe(
      false,
    );
  });

  it('fail-opens adaptive replan when Jev errors', async () => {
    const client = { systemOne: vi.fn().mockRejectedValue(new Error('down')) } as unknown as JevClient;
    await expect(shouldSkipAdaptiveReplan('x', 1, client, enabled)).resolves.toBe(false);
  });

  it('nudges ReAct stop only with high can_stop and clear progress', async () => {
    const client = mockClient({
      progress: { type: 'score', score: 1.8, confidence: 0.9 },
      can_stop: { type: 'noul', noul: 0.96 },
    });
    await expect(
      shouldNudgeReactStop({ userGoal: 'scan', observation: 'ports open', tool: 'nmap_scan' }, client, enabled),
    ).resolves.toBe(true);

    const weak = mockClient({
      progress: { type: 'score', score: 0.4, confidence: 0.9 },
      can_stop: { type: 'noul', noul: 0.96 },
    });
    await expect(
      shouldNudgeReactStop({ userGoal: 'scan', observation: 'timeout', tool: 'nmap_scan' }, weak, enabled),
    ).resolves.toBe(false);
  });

  it('drops clearly irrelevant context snippets', async () => {
    const client = mockClient({
      item_0: { type: 'noul', noul: 0.92 },
      item_1: { type: 'noul', noul: 0.1 },
    });
    const keep = await filterContextSnippetsWithJev(
      {
        query: 'scan 10.0.0.5',
        focus: ['10.0.0.5'],
        items: [
          { id: 'vec-1', content: 'target 10.0.0.5 open 22' },
          { id: 'vec-2', content: 'unrelated cooking recipe' },
        ],
      },
      client,
      enabled,
    );
    expect(keep?.has('vec-1')).toBe(true);
    expect(keep?.has('vec-2')).toBe(false);
  });
});
