import { describe, expect, it } from 'vitest';
import { parseSse, scoreRun, summarize } from './metrics.mjs';

const sse = [
  'event: context_usage',
  'data: {"used_tokens":120,"context_window":8000}',
  '',
  'event: action_start',
  'data: {"tool":"execute_command","iteration":1}',
  '',
  'event: action_result',
  'data: {"tool":"execute_command","result":"**执行器** local"}',
  '',
  'event: confirm_required',
  'data: {"kind":"sensitive_tool","tool":"execute_command"}',
  '',
  'event: response',
  'data: {"content":"token BENCH_OK"}',
  '',
  'event: done',
  'data: {}',
  '',
].join('\n');

describe('bench metrics', () => {
  it('scores pass, tokens, tool rounds, HITL, and local fallback from SSE', () => {
    const events = parseSse(sse);
    const row = scoreRun({ id: 'owned-lab', success: { regex: 'BENCH_OK' } }, events, 1500);
    expect(row).toMatchObject({
      id: 'owned-lab',
      passed: true,
      tokens: 120,
      tool_rounds: 1,
      elapsed_ms: 1500,
      hitl: 1,
      fallback_local: true,
    });
    expect(summarize([row, { ...row, id: 'miss', passed: false, fallback_local: false }])).toMatchObject({
      total: 2,
      passed: 1,
      pass_at_1: 0.5,
      hitl: 2,
      fallback_local: 1,
    });
  });
});
