import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import { BaseTool, ToolResult } from '../core/base-tool';
import {
  shellProfile,
  validateCommandAgainstShell,
  type ShellExecutionProfile,
  type ShellKind,
} from './shell-command-guard.js';

const OUTPUT_SENTINEL = '__SECBOT_CMD_DONE__';
const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

const sessions = new Map<string, TerminalSession>();

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

class TerminalSession {
  private process: ChildProcessWithoutNullStreams | null = null;
  private outputBuffer = '';
  private queue: Promise<unknown> = Promise.resolve();
  private shellProfile!: ShellExecutionProfile;
  lastActive = Date.now();

  constructor(
    readonly sessionId: string,
    private readonly cwd?: string,
  ) {}

  get alive(): boolean {
    return this.process !== null && this.process.exitCode === null && !this.process.killed;
  }

  get pid(): number | null {
    return this.process?.pid ?? null;
  }

  getShellProfile(): ShellExecutionProfile {
    return this.shellProfile;
  }

  async start(): Promise<string> {
    const resolvedCwd = await TerminalSession.resolveCwd(this.cwd);
    const shell = this.getShellSpec();
    this.shellProfile = shellProfile(shell.kind, shell.label);

    this.process = spawn(shell.command, shell.args, {
      cwd: resolvedCwd,
      env: { ...process.env, TERM: 'dumb' },
      stdio: 'pipe',
      windowsHide: true,
    });
    this.process.stdout.setEncoding('utf8');
    this.process.stderr.setEncoding('utf8');
    this.process.stdout.on('data', (chunk: string) => this.appendOutput(chunk));
    this.process.stderr.on('data', (chunk: string) => this.appendOutput(chunk));

    this.lastActive = Date.now();
    await sleep(250);
    const banner = this.drainBuffer();
    const prefix = `Terminal session started (shell=${shell.label}, kind=${shell.kind}, pid=${this.pid ?? 'n/a'})`;
    return banner ? `${prefix}\n${banner}` : prefix;
  }

  execute(command: string, timeoutMs: number): Promise<string> {
    const work = async (): Promise<string> => {
      if (!this.process || !this.alive) {
        throw new Error('Terminal session is not active');
      }
      this.lastActive = Date.now();
      this.drainBuffer();

      const marker = `${OUTPUT_SENTINEL}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload =
        process.platform === 'win32'
          ? `${command}\r\necho ${marker}\r\n`
          : `${command}\necho ${marker}\n`;

      this.process.stdin.write(payload, 'utf8');

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (this.outputBuffer.includes(marker)) break;
        if (!this.alive) break;
        await sleep(80);
      }

      const output = this.drainBuffer();
      if (!output.includes(marker) && Date.now() >= deadline) {
        throw new Error(`Terminal command timeout after ${Math.round(timeoutMs / 1000)}s`);
      }
      return this.cleanOutput(output, command, marker);
    };

    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  read(): string {
    this.lastActive = Date.now();
    return this.drainBuffer();
  }

  async close(): Promise<string> {
    if (!this.process) {
      return `Terminal session closed (session=${this.sessionId})`;
    }

    if (this.alive) {
      try {
        this.process.stdin.write('exit\n', 'utf8');
      } catch {
        // ignored
      }
    }

    await this.waitForExit(3_000);
    if (this.alive) {
      this.process.kill();
      await this.waitForExit(1_000);
    }

    const remaining = this.drainBuffer();
    const prefix = `Terminal session closed (session=${this.sessionId})`;
    return remaining ? `${prefix}\n${remaining}` : prefix;
  }

  private waitForExit(timeoutMs: number): Promise<void> {
    if (!this.process || !this.alive) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }
      const proc = this.process;
      const timer = setTimeout(() => resolve(), timeoutMs);
      proc.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private appendOutput(chunk: string): void {
    this.outputBuffer += chunk;
    if (this.outputBuffer.length > 200_000) {
      this.outputBuffer = this.outputBuffer.slice(-100_000);
    }
  }

  private drainBuffer(): string {
    const text = this.outputBuffer;
    this.outputBuffer = '';
    return text;
  }

  private cleanOutput(output: string, command: string, marker: string): string {
    const lines = output.split(/\r?\n/);
    const cleaned: string[] = [];
    for (const line of lines) {
      const stripped = line.trim();
      if (stripped.includes(marker)) continue;
      if (stripped === `echo ${marker}`) continue;
      cleaned.push(line);
    }
    let text = cleaned.join('\n').trim();
    if (text.startsWith(command.trim())) {
      text = text.slice(command.trim().length).trimStart();
    }
    return text;
  }

  private getShellSpec(): { command: string; args: string[]; label: string; kind: ShellKind } {
    if (process.platform === 'win32') {
      const comspec = process.env.COMSPEC || 'cmd.exe';
      const lower = comspec.toLowerCase();
      const kind: ShellKind =
        lower.includes('powershell') || lower.endsWith('pwsh.exe') ? 'powershell' : 'cmd';
      return { command: comspec, args: [], label: path.basename(comspec), kind };
    }
    if (process.platform === 'darwin') {
      const shell = process.env.SHELL || '/bin/zsh';
      return { command: shell, args: [], label: path.basename(shell), kind: 'posix' };
    }
    const shell = process.env.SHELL || '/bin/bash';
    return { command: shell, args: [], label: path.basename(shell), kind: 'posix' };
  }

  static async resolveCwd(cwd?: string): Promise<string | undefined> {
    if (!cwd || !cwd.trim()) return undefined;
    const resolved = path.resolve(cwd.trim());
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        throw new Error(`Working directory is not a directory: ${resolved}`);
      }
      return resolved;
    } catch {
      throw new Error(`Working directory does not exist: ${resolved}`);
    }
  }
}

function cleanupIdleSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    const isIdle = now - session.lastActive > SESSION_IDLE_TIMEOUT_MS;
    if (!session.alive || isIdle) {
      sessions.delete(sessionId);
      void session.close();
    }
  }
}

export class TerminalSessionTool extends BaseTool {
  constructor() {
    super(
      'terminal_session',
      'Persistent terminal sessions: open/exec/read/close/list; optional open_external. ' +
        'action=open 返回的 shell_profile 为后端真实会话 shell（由 COMSPEC/SHELL 决定）；exec 的 command 须与之语法一致。' +
        'open_external 仅打开本机窗口，返回值中的 shell_profile 用于提示用户手写命令的环境。',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const action = String(params.action ?? '')
      .trim()
      .toLowerCase();
    cleanupIdleSessions();

    if (action === 'open') return await this.openSession(params);
    if (action === 'open_external') return await this.openExternal(params);
    if (action === 'exec') return await this.execInSession(params);
    if (action === 'read') return this.readSession(params);
    if (action === 'close') return await this.closeSession(params);
    if (action === 'list') return this.listSessions();

    return {
      success: false,
      result: null,
      error: `Unknown action: ${action}. Allowed: open/open_external/exec/read/close/list`,
    };
  }

  private async openSession(params: Record<string, unknown>): Promise<ToolResult> {
    const requestedCwd = String(params.cwd ?? '').trim() || undefined;
    const sessionId = randomUUID().slice(0, 8);

    let session = new TerminalSession(sessionId, requestedCwd);
    let message = '';

    try {
      message = await session.start();
    } catch (error) {
      if (requestedCwd) {
        session = new TerminalSession(sessionId, undefined);
        message = `[cwd fallback to process directory]\n${await session.start()}`;
      } else {
        return {
          success: false,
          result: null,
          error: `Terminal session start failed: ${(error as Error).message}`,
        };
      }
    }

    sessions.set(sessionId, session);

    return {
      success: true,
      result: {
        session_id: sessionId,
        message,
        shell_profile: session.getShellProfile(),
        hint:
          'Use action=exec with this session_id; command syntax must match shell_profile.kind (cmd / powershell / posix).',
        read_only_for_user: true,
      },
    };
  }

  private async openExternal(params: Record<string, unknown>): Promise<ToolResult> {
    const cwdInput = String(params.cwd ?? '').trim() || undefined;
    let initialCommand = String(params.initial_command ?? '').trim();
    const userIntent = String(params.user_intent ?? '').trim();
    if (!initialCommand && userIntent) {
      initialCommand = userIntent;
    }

    let cwd: string | undefined;
    try {
      cwd = await TerminalSession.resolveCwd(cwdInput);
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }

    const opened = await this.spawnExternalTerminal(cwd, initialCommand);
    if (!opened.ok) {
      return {
        success: false,
        result: null,
        error: `Unable to launch external terminal: ${opened.error}`,
      };
    }

    const extShellProfile: ShellExecutionProfile =
      process.platform === 'win32'
        ? shellProfile('powershell', opened.shell_name)
        : shellProfile('posix', `${opened.shell_name}（默认登录 shell）`);

    return {
      success: true,
      result: {
        message: `Opened a new external terminal window (${opened.shell_name}).`,
        initial_command: initialCommand || null,
        shell_profile: extShellProfile,
        hint:
          '外部窗口不由本工具注入 exec；若要在会话内自动执行请用 action=open。手写命令时请按 shell_profile 语法。',
      },
    };
  }

  private async execInSession(params: Record<string, unknown>): Promise<ToolResult> {
    let sessionId = String(params.session_id ?? '').trim();
    if (!sessionId) {
      const alive = [...sessions.entries()].filter(([, session]) => session.alive);
      if (alive.length === 1) {
        sessionId = alive[0][0];
      } else {
        return { success: false, result: null, error: 'Missing session_id' };
      }
    }

    if (sessionId.includes('<') || sessionId.includes('>')) {
      return {
        success: false,
        result: null,
        error: 'Invalid session_id placeholder. Use the real id returned by action=open.',
      };
    }

    const session = sessions.get(sessionId);
    if (!session || !session.alive) {
      return {
        success: false,
        result: null,
        error: `Session ${sessionId} does not exist or is closed.`,
      };
    }

    const command = String(params.command ?? '').trim();
    if (!command) {
      return { success: false, result: null, error: 'Missing parameter: command' };
    }

    let timeoutSec = Number(params.timeout ?? 30);
    if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) timeoutSec = 30;
    timeoutSec = Math.min(timeoutSec, 120);

    const mismatch = validateCommandAgainstShell(command, session.getShellProfile());
    if (mismatch) {
      return {
        success: false,
        result: {
          session_id: sessionId,
          shell_profile: session.getShellProfile(),
          command,
        },
        error: mismatch,
      };
    }

    try {
      const output = await session.execute(command, Math.floor(timeoutSec * 1000));
      return {
        success: true,
        result: {
          session_id: sessionId,
          command,
          output,
          shell_profile: session.getShellProfile(),
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

  private readSession(params: Record<string, unknown>): ToolResult {
    let sessionId = String(params.session_id ?? '').trim();
    if (!sessionId) {
      const alive = [...sessions.entries()].filter(([, session]) => session.alive);
      if (alive.length === 1) {
        sessionId = alive[0][0];
      } else {
        return { success: false, result: null, error: 'Missing session_id' };
      }
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, result: null, error: `Session ${sessionId} does not exist.` };
    }

    const output = session.read();
    return {
      success: true,
      result: {
        session_id: sessionId,
        output: output || '(no new output)',
        alive: session.alive,
        shell_profile: session.getShellProfile(),
      },
    };
  }

  private async closeSession(params: Record<string, unknown>): Promise<ToolResult> {
    const sessionId = String(params.session_id ?? '').trim();
    if (!sessionId) {
      return { success: false, result: null, error: 'Missing session_id' };
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, result: null, error: `Session ${sessionId} does not exist.` };
    }
    sessions.delete(sessionId);
    const message = await session.close();
    return {
      success: true,
      result: { session_id: sessionId, message },
    };
  }

  private listSessions(): ToolResult {
    const data = [...sessions.entries()].map(([sessionId, session]) => ({
      session_id: sessionId,
      alive: session.alive,
      idle_seconds: Math.round((Date.now() - session.lastActive) / 100) / 10,
      pid: session.pid,
      shell_profile: session.getShellProfile(),
    }));
    return {
      success: true,
      result: {
        active_sessions: data.filter((entry) => entry.alive).length,
        sessions: data,
      },
    };
  }

  private async spawnExternalTerminal(
    cwd: string | undefined,
    initialCommand: string,
  ): Promise<{ ok: boolean; shell_name: string; error?: string }> {
    const workDir = cwd ?? process.cwd();

    try {
      if (process.platform === 'win32') {
        const escaped = workDir.replace(/'/g, "''");
        const psCmd = initialCommand
          ? `Set-Location -LiteralPath '${escaped}'; ${initialCommand}`
          : `Set-Location -LiteralPath '${escaped}'`;
        const child = spawn(
          'cmd.exe',
          ['/c', 'start', 'powershell', '-NoExit', '-Command', psCmd],
          {
            cwd: workDir,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          },
        );
        child.unref();
        return { ok: true, shell_name: 'PowerShell' };
      }

      if (process.platform === 'darwin') {
        const cmd = initialCommand
          ? `cd ${this.quoteForShell(workDir)}; ${initialCommand}`
          : `cd ${this.quoteForShell(workDir)}`;
        const script = `tell application "Terminal" to do script ${JSON.stringify(cmd)}`;
        const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
        child.unref();
        return { ok: true, shell_name: 'Terminal.app' };
      }

      const cmd = initialCommand
        ? `cd ${this.quoteForShell(workDir)}; ${initialCommand}; exec $SHELL`
        : `cd ${this.quoteForShell(workDir)}; exec $SHELL`;

      if (await this.fileExists('/usr/bin/gnome-terminal')) {
        const child = spawn('gnome-terminal', ['--', 'bash', '-lc', cmd], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        return { ok: true, shell_name: 'gnome-terminal' };
      }

      if (await this.fileExists('/usr/bin/xterm')) {
        const child = spawn('xterm', ['-e', 'bash', '-lc', cmd], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        return { ok: true, shell_name: 'xterm' };
      }

      return { ok: false, shell_name: 'none', error: 'No supported terminal binary found' };
    } catch (error) {
      return {
        ok: false,
        shell_name: 'unknown',
        error: (error as Error).message,
      };
    }
  }

  private quoteForShell(input: string): string {
    return `'${input.replace(/'/g, `'\\''`)}'`;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
