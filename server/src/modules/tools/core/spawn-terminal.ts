import { spawn } from 'node:child_process';
import type { ToolProgressCallback } from './base-tool';

const TAIL_LINES = 12;
const TAIL_CHARS = 1600;

/** 保留终端最近几行，把回车覆盖的进度条收成独立行。 */
export function terminalTail(text: string, maxLines = TAIL_LINES, maxChars = TAIL_CHARS): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  return lines.slice(-maxLines).join('\n').slice(-maxChars);
}

export interface SpawnTerminalResult {
  code: number;
  stdout: string;
  stderr: string;
  error?: string;
}

/** 启动外部命令，并把 stdout/stderr 的最新片段通过 onProgress.raw 映射出去。 */
export function spawnTerminal(options: {
  command: string;
  args: string[];
  timeoutSec: number;
  tool: string;
  displayCommand: string;
  onProgress?: ToolProgressCallback;
  missingMessage: string;
}): Promise<SpawnTerminalResult> {
  const { command, args, timeoutSec, tool, displayCommand, onProgress, missingMessage } = options;
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let lastNoticeAt = 0;
    const startedAt = Date.now();

    const emit = (status: 'running' | 'timed_out' | 'failed', message: string) => {
      onProgress?.({
        status,
        tool,
        command: displayCommand,
        phase: status === 'running' ? 'output' : status,
        elapsed_ms: Date.now() - startedAt,
        last_output_age_ms: 0,
        message,
        hint: `超时上限 ${timeoutSec} 秒`,
        raw: terminalTail(`${stdout}\n${stderr}`),
      });
    };

    const finish = (result: SpawnTerminalResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    emit('running', '已启动，正在映射终端输出');

    const note = () => {
      const now = Date.now();
      if (now - lastNoticeAt < 400) return;
      lastNoticeAt = now;
      const raw = terminalTail(`${stdout}\n${stderr}`);
      const last = raw.split('\n').at(-1)?.trim() || '终端有新输出';
      emit('running', last);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      note();
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      note();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 1500);
      setTimeout(() => {
        const tail = terminalTail(`${stdout}\n${stderr}`);
        emit('timed_out', `${command} 超时 (${timeoutSec}s)`);
        finish({
          code: -1,
          stdout,
          stderr,
          error: tail
            ? `${command} 超时 (${timeoutSec}s)\n${tail}`
            : `${command} 超时 (${timeoutSec}s)`,
        });
      }, 3000);
    }, timeoutSec * 1000);

    child.on('error', (err) => {
      const msg = /ENOENT/.test(err.message) ? missingMessage : err.message;
      emit('failed', msg);
      finish({ code: -1, stdout, stderr, error: msg });
    });

    child.on('close', (code) => {
      if (timedOut) {
        const tail = terminalTail(`${stdout}\n${stderr}`);
        emit('timed_out', `${command} 超时 (${timeoutSec}s)`);
        finish({
          code: code ?? -1,
          stdout,
          stderr,
          error: tail
            ? `${command} 超时 (${timeoutSec}s)\n${tail}`
            : `${command} 超时 (${timeoutSec}s)`,
        });
        return;
      }
      finish({ code: code ?? 0, stdout, stderr });
    });
  });
}
