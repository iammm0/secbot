import { spawn } from 'node:child_process';
import { BaseTool, ToolResult } from '../core/base-tool';

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
  constructor() {
    super('execute_command', 'Execute system shell commands with timeout and output capture.');
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

    try {
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
        error: result.returnCode === 0 ? undefined : result.stderr || `Command failed with code ${result.returnCode}`,
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: (error as Error).message,
      };
    }
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

    const shellPath = process.env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    return { command: shellPath, args: ['-lc', command] };
  }
}
