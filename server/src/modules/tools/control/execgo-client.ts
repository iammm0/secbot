import { spawn } from 'node:child_process';

type JsonObject = Record<string, unknown>;

export interface ExecGoActionRequest {
  adapter: string;
  agent_id: string;
  session_id: string;
  action_id: string;
  action: {
    kind: string;
    input?: JsonObject;
    depends_on?: string[];
    retry?: number;
    timeout?: number;
  };
  metadata?: JsonObject;
}

export interface ExecGoCommandResult {
  taskId: string;
  status: string;
  returnCode: number;
  stdout: string;
  stderr: string;
  output: string;
  task: JsonObject | null;
}

interface ExecGoEnvelope {
  ok: boolean;
  data?: JsonObject;
  error?: {
    message?: string;
    status_code?: number;
    body?: unknown;
  };
}

interface ExecGoProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function execGoEnabled(value: unknown = process.env.SECBOT_EXECGO_ENABLED): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

export class ExecGoClient {
  private readonly cli: string;

  constructor(cli = process.env.EXECGO_EXECGOCLI || 'execgocli') {
    this.cli = cli;
  }

  async health(timeoutMs = 10_000): Promise<JsonObject> {
    return this.runEnvelope(['health'], undefined, timeoutMs);
  }

  async tools(timeoutMs = 10_000): Promise<JsonObject> {
    return this.runEnvelope(['tools'], undefined, timeoutMs);
  }

  async act(request: ExecGoActionRequest, timeoutMs = 30_000): Promise<JsonObject> {
    return this.runEnvelope(['act'], JSON.stringify(request), timeoutMs);
  }

  async wait(taskIds: string[], timeoutMs = 60_000): Promise<JsonObject> {
    return this.runEnvelope(['wait', '-task-ids', taskIds.join(',')], undefined, timeoutMs);
  }

  async actAndWait(request: ExecGoActionRequest, timeoutMs = 60_000): Promise<JsonObject> {
    const accepted = await this.act(request, Math.min(timeoutMs, 30_000));
    const taskIds = this.readTaskIds(accepted);
    if (taskIds.length === 0) {
      throw new Error('ExecGo accepted action but returned no task_ids');
    }
    return await this.wait(taskIds, timeoutMs);
  }

  async command(request: ExecGoActionRequest, timeoutMs = 60_000): Promise<ExecGoCommandResult> {
    const waited = await this.actAndWait(request, timeoutMs);
    const tasks = Array.isArray(waited.tasks) ? waited.tasks : [];
    const firstTask = this.asObject(tasks[0]) ?? null;
    const taskId = this.findString(firstTask, ['id', 'task_id']) ?? request.action_id;
    const status = this.findString(firstTask, ['status', 'state']) ?? 'unknown';
    const stdout = this.findText(firstTask, [
      ['result', 'stdout'],
      ['runtime', 'stdout'],
      ['output', 'stdout'],
      ['stdout'],
    ]);
    const stderr = this.findText(firstTask, [
      ['result', 'stderr'],
      ['runtime', 'stderr'],
      ['output', 'stderr'],
      ['stderr'],
      ['error'],
    ]);
    const output =
      this.findText(firstTask, [['result', 'output'], ['runtime', 'output'], ['output']]) ||
      stdout ||
      stderr;
    const returnCode = this.findNumber(firstTask, [
      ['result', 'returncode'],
      ['result', 'return_code'],
      ['result', 'exit_code'],
      ['runtime', 'returncode'],
      ['runtime', 'exit_code'],
      ['returncode'],
      ['exit_code'],
    ]);

    return {
      taskId,
      status,
      returnCode: returnCode ?? (status === 'success' ? 0 : -1),
      stdout,
      stderr,
      output,
      task: firstTask,
    };
  }

  private async runEnvelope(
    args: string[],
    stdin: string | undefined,
    timeoutMs: number,
  ): Promise<JsonObject> {
    const result = await this.runProcess(args, stdin, timeoutMs);
    const envelope = this.parseEnvelope(result.stdout, result.stderr);
    if (!envelope.ok) {
      const status = envelope.error?.status_code ? ` (${envelope.error.status_code})` : '';
      const body =
        envelope.error?.body === undefined ? '' : `\n${this.stringify(envelope.error.body)}`;
      throw new Error(`${envelope.error?.message ?? 'ExecGo command failed'}${status}${body}`);
    }
    return envelope.data ?? {};
  }

  private runProcess(
    args: string[],
    stdin: string | undefined,
    timeoutMs: number,
  ): Promise<ExecGoProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.cli, args, {
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          EXECGO_URL: process.env.EXECGO_URL || 'http://127.0.0.1:8080',
          EXECGO_RUNTIME_URL: process.env.EXECGO_RUNTIME_URL || 'http://127.0.0.1:18080',
        },
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      const timer = setTimeout(
        () => {
          timedOut = true;
          child.kill('SIGTERM');
        },
        Math.max(1, timeoutMs),
      );

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`ExecGo command timeout after ${Math.round(timeoutMs / 1000)}s`));
          return;
        }
        resolve({ code: code ?? -1, stdout, stderr });
      });

      if (stdin && child.stdin.writable) {
        child.stdin.write(stdin);
      }
      child.stdin.end();
    });
  }

  private parseEnvelope(stdout: string, stderr: string): ExecGoEnvelope {
    const raw = stdout.trim() || stderr.trim();
    if (!raw) {
      return { ok: false, error: { message: 'ExecGo produced no JSON output' } };
    }
    try {
      const parsed = JSON.parse(raw) as ExecGoEnvelope;
      if (typeof parsed.ok !== 'boolean') {
        return {
          ok: false,
          error: { message: 'ExecGo JSON envelope missing ok boolean', body: raw },
        };
      }
      return parsed;
    } catch (error) {
      return {
        ok: false,
        error: {
          message: `Failed to parse ExecGo JSON output: ${(error as Error).message}`,
          body: raw,
        },
      };
    }
  }

  private readTaskIds(data: JsonObject): string[] {
    const ids = data.task_ids;
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => String(id)).filter(Boolean);
  }

  private asObject(value: unknown): JsonObject | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonObject;
    }
    return null;
  }

  private getPath(root: unknown, path: string[]): unknown {
    let current: unknown = root;
    for (const key of path) {
      const obj = this.asObject(current);
      if (!obj) return undefined;
      current = obj[key];
    }
    return current;
  }

  private findString(root: unknown, keys: string[]): string | undefined {
    const obj = this.asObject(root);
    if (!obj) return undefined;
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
  }

  private findText(root: unknown, paths: string[][]): string {
    for (const path of paths) {
      const value = this.getPath(root, path);
      if (typeof value === 'string') return value;
      if (value !== undefined && value !== null && typeof value !== 'object') return String(value);
    }
    return '';
  }

  private findNumber(root: unknown, paths: string[][]): number | undefined {
    for (const path of paths) {
      const value = this.getPath(root, path);
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return undefined;
  }

  private stringify(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
}
