import { describe, expect, it } from 'vitest';
import {
  buildResumePrompt,
  looksLikeContinue,
  throwIfAborted,
  TaskPausedError,
  type PausedTaskSnapshot,
} from './paused-task';

describe('buildResumePrompt', () => {
  const paused: PausedTaskSnapshot = {
    originalMessage: '扫描 example.com 开放端口',
    progressNote: '已完成 nmap 发现 80/443',
    todos: [
      { id: 'recon-1', content: '端口扫描', status: 'completed' },
      { id: 'scan-1', content: '目录爆破', status: 'in_progress' },
    ],
  };

  it('keeps the original task and appends the follow-up', () => {
    const prompt = buildResumePrompt(paused, '先只扫 443');
    expect(prompt).toContain('原任务：扫描 example.com 开放端口');
    expect(prompt).toContain('已完成 nmap 发现 80/443');
    expect(prompt).toContain('[completed] 端口扫描');
    expect(prompt).toContain('[in_progress] 目录爆破');
    expect(prompt).toContain('用户本次补充：先只扫 443');
    expect(prompt).toContain('从中断处接着做完原任务');
  });

  it('uses a default continue instruction when the follow-up is empty', () => {
    const prompt = buildResumePrompt(paused, '   ');
    expect(prompt).toContain('请从中断处继续完成原任务。');
  });
});

describe('throwIfAborted / looksLikeContinue', () => {
  it('throws TaskPausedError only after abort', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
    const abort = new AbortController();
    expect(() => throwIfAborted(abort.signal)).not.toThrow();
    abort.abort();
    expect(() => throwIfAborted(abort.signal, { originalMessage: 'scan me' })).toThrow(
      TaskPausedError,
    );
    expect(looksLikeContinue('继续')).toBe(true);
    expect(looksLikeContinue('扫描 example.com')).toBe(false);
    expect(looksLikeContinue('')).toBe(true);
  });
});
