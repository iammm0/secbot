import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { BaseTool, ToolResult } from '../core/base-tool';
import { ExecGoActionRequest, ExecGoClient, execGoEnabled } from './execgo-client.js';
import { executeCommandShellProfile, validateCommandAgainstShell } from './shell-command-guard.js';

function adaptCommandForPlatform(command: string): string {
  if (process.platform !== 'darwin') {
    return command;
  }
  const cmd = command.trim();
  if (cmd.startsWith('netstat ') || cmd === 'netstat') {
    if (/-[a-z]*[tulpo][a-z]*/i.test(cmd) || /\s-o\s|\s-p\s/i.test(cmd)) {
      return 'netstat -an';
    }
  }
  return command;
}

export class ExecuteCommandTool extends BaseTool {
  private readonly execGoClient = new ExecGoClient();

  constructor() {
    super(
      'execute_command',
      'Execute shell commands on the backend host with timeout. ' +
        'Windows: always via cmd.exe /d /s /c (CMD syntax). ' +
        'Unix: via login shell -lc (POSIX). Command must match that environment; see also terminal_session. ' +
        'Set SECBOT_EXECGO_ENABLED=1 or pass execgo=true to route execution through ExecGo runtime.command.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const rawCommand = String(params.command ?? '').trim();
    const shell = params.shell === undefined ? true : Boolean(params.shell);
    const timeoutSec = Number(params.timeout ?? 30);
    const timeoutMs = Math.max(1, Math.floor(timeoutSec * 1000));
    const cwd = params.cwd ? String(params.cwd) : undefined;
    const stdinData = params.stdin_data ? String(params.stdin_data) : undefined;

    if (!rawCommand) {
      return { success: false, result: null, error: 'Missing parameter: command' };
    }

    const command = adaptCommandForPlatform(rawCommand);

    if (shell) {
      const profile = executeCommandShellProfile();
      const mismatch = validateCommandAgainstShell(command, profile);
      if (mismatch) {
        return { success: false, result: { command, shell_profile: profile }, error: mismatch };
      }
    }

    try {
      if (this.shouldUseExecGo(params)) {
        if (cwd || stdinData) {
          return {
            success: false,
            result: {
              command,
              executor: 'execgo',
              unsupported: {
                cwd: Boolean(cwd),
                stdin_data: Boolean(stdinData),
              },
            },
            error:
              'ExecGo runtime.command currently supports command, args, and timeout only; cwd and stdin_data are not accepted by this local ExecGo runtime schema.',
          };
        }

        const result = await this.executeViaExecGo(command, shell, timeoutMs, params);
        return {
          success: result.returnCode === 0,
          result: {
            command,
            returncode: result.returnCode,
            stdout: result.stdout,
            stderr: result.stderr,
            output: result.output || (result.returnCode === 0 ? result.stdout : result.stderr),
            executor: 'execgo',
            action_id: result.actionId,
            task_id: result.taskId,
            task_status: result.status,
            task: result.task,
          },
          error:
            result.returnCode === 0
              ? undefined
              : result.stderr ||
                result.output ||
                `ExecGo command failed with status ${result.status}`,
        };
      }

      const result = await this.execute(command, shell, timeoutMs, cwd, stdinData);
      return {
        success: result.returnCode === 0,
        result: {
          command,
          returncode: result.returnCode,
          stdout: result.stdout,
          stderr: result.stderr,
          output: result.returnCode === 0 ? result.stdout : result.stderr,
        },
        error:
          result.returnCode === 0
            ? undefined
            : result.stderr || `Command failed with code ${result.returnCode}`,
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: (error as Error).message,
      };
    }
  }

  private shouldUseExecGo(params: Record<string, unknown>): boolean {
    if (params.execgo !== undefined) return Boolean(params.execgo);
    const backend = String(process.env.SECBOT_COMMAND_BACKEND ?? '')
      .trim()
      .toLowerCase();
    if (backend === 'execgo' || backend === 'execgo-runtime') return true;
    return execGoEnabled();
  }

  private async executeViaExecGo(
    command: string,
    shell: boolean,
    timeoutMs: number,
    params: Record<string, unknown>,
  ): Promise<{
    actionId: string;
    taskId: string;
    status: string;
    returnCode: number;
    stdout: string;
    stderr: string;
    output: string;
    task: Record<string, unknown> | null;
  }> {
    const spawnSpec = this.buildSpawnSpec(command, shell);
    const actionId = String(
      params.action_id ?? `secbot-command-${Date.now()}-${randomUUID().slice(0, 8)}`,
    );
    const input: Record<string, unknown> = {
      program: spawnSpec.command,
      args: spawnSpec.args,
      limits: {
        wall_time_ms: timeoutMs,
      },
    };

    const request: ExecGoActionRequest = {
      adapter: 'secbot',
      agent_id: String(params.agent_id ?? process.env.SECBOT_EXECGO_AGENT_ID ?? 'secbot-backend'),
      session_id: String(
        params.session_id ?? process.env.SECBOT_EXECGO_SESSION_ID ?? 'secbot-session',
      ),
      action_id: actionId,
      action: {
        kind: 'runtime.command',
        input,
      },
      metadata: {
        source: 'secbot',
        tool: 'execute_command',
        original_command: command,
      },
    };

    const result = await this.execGoClient.command(request, timeoutMs + 5_000);
    return {
      actionId,
      taskId: result.taskId,
      status: result.status,
      returnCode: result.returnCode,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.output,
      task: result.task,
    };
  }

  private execute(
    command: string,
    shell: boolean,
    timeoutMs: number,
    cwd?: string,
    stdinData?: string,
  ): Promise<{ returnCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const spawnSpec = this.buildSpawnSpec(command, shell);
      const child = spawn(spawnSpec.command, spawnSpec.args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', (err) => {
        reject(err);
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      if (stdinData && child.stdin.writable) {
        child.stdin.write(stdinData);
      }
      child.stdin.end();

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`Command timeout after ${Math.round(timeoutMs / 1000)}s`));
          return;
        }
        resolve({
          returnCode: code ?? -1,
          stdout,
          stderr,
        });
      });
    });
  }

  private buildSpawnSpec(command: string, shell: boolean): { command: string; args: string[] } {
    if (!shell) {
      const tokens = command.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) {
        return { command, args: [] };
      }
      return { command: tokens[0], args: tokens.slice(1) };
    }

    if (process.platform === 'win32') {
      return { command: 'cmd.exe', args: ['/d', '/s', '/c', command] };
    }

    const shellPath =
      process.env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    return { command: shellPath, args: ['-lc', command] };
  }
}
