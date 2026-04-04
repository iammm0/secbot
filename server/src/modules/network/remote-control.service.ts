import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as net from 'node:net';

type ConnectionType = 'ssh' | 'winrm' | 'smb' | string;

type RemoteSession = {
  type: ConnectionType;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  keyFile?: string;
  connectedAt: string;
};

type ExecResult = {
  target_ip: string;
  command: string;
  timestamp: string;
  success: boolean;
  output: string;
  error: string;
  exit_code?: number;
};

type TransferResult = {
  target_ip: string;
  local_path: string;
  remote_path: string;
  timestamp: string;
  success: boolean;
  error: string;
};

@Injectable()
export class RemoteControlService {
  private readonly activeSessions = new Map<string, RemoteSession>();
  private commandExistsCache = new Map<string, boolean>();

  async connectSsh(
    host: string,
    port: number,
    username: string,
    password?: string,
    keyFile?: string,
  ): Promise<boolean> {
    if (!host || !username) return false;
    const tcpOk = await this.checkTcp(host, port, 3000);
    if (!tcpOk) return false;

    const key = this.sessionKey(host, 'ssh');
    this.activeSessions.set(key, {
      type: 'ssh',
      host,
      port,
      username,
      password,
      keyFile,
      connectedAt: new Date().toISOString(),
    });
    return true;
  }

  connectWinrm(host: string, username: string, password: string): boolean {
    if (!host || !username || !password) return false;
    const key = this.sessionKey(host, 'winrm');
    this.activeSessions.set(key, {
      type: 'winrm',
      host,
      username,
      password,
      connectedAt: new Date().toISOString(),
    });
    return true;
  }

  async executeCommand(
    targetIp: string,
    command: string,
    connectionType: ConnectionType = 'ssh',
    options: {
      port?: number;
      username?: string;
      password?: string;
      keyFile?: string;
    } = {},
  ): Promise<ExecResult> {
    const result: ExecResult = {
      target_ip: targetIp,
      command,
      timestamp: new Date().toISOString(),
      success: false,
      output: '',
      error: '',
    };

    try {
      if (connectionType === 'ssh') {
        const session = await this.ensureSshSession(targetIp, options);
        if (!session) {
          result.error = 'SSH connection not available';
          return result;
        }

        const exec = await this.execSsh(
          session.host,
          session.port ?? 22,
          session.username ?? '',
          command,
          session.password,
          session.keyFile,
        );
        result.success = exec.code === 0;
        result.output = exec.stdout;
        result.error = exec.stderr;
        result.exit_code = exec.code;
        return result;
      }

      if (connectionType === 'winrm') {
        const username = options.username ?? '';
        const password = options.password ?? '';
        const exec = await this.execWinrm(targetIp, username, password, command);
        result.success = exec.code === 0;
        result.output = exec.stdout;
        result.error = exec.stderr;
        result.exit_code = exec.code;
        return result;
      }

      if (connectionType === 'smb') {
        result.error = 'SMB execution is not implemented';
        return result;
      }

      result.error = `Unsupported connection type: ${connectionType}`;
      return result;
    } catch (error) {
      result.error = (error as Error).message;
      return result;
    }
  }

  async uploadFile(
    targetIp: string,
    localPath: string,
    remotePath: string,
    connectionType: ConnectionType = 'ssh',
    options: {
      port?: number;
      username?: string;
      password?: string;
      keyFile?: string;
    } = {},
  ): Promise<TransferResult> {
    const result: TransferResult = {
      target_ip: targetIp,
      local_path: localPath,
      remote_path: remotePath,
      timestamp: new Date().toISOString(),
      success: false,
      error: '',
    };

    try {
      if (connectionType !== 'ssh') {
        result.error = `Unsupported connection type: ${connectionType}`;
        return result;
      }

      const session = await this.ensureSshSession(targetIp, options);
      if (!session) {
        result.error = 'SSH connection not available';
        return result;
      }

      const scp = await this.execScpUpload(
        session.host,
        session.port ?? 22,
        session.username ?? '',
        localPath,
        remotePath,
        session.password,
        session.keyFile,
      );
      result.success = scp.code === 0;
      result.error = scp.code === 0 ? '' : scp.stderr || `Upload failed with exit code ${scp.code}`;
      return result;
    } catch (error) {
      result.error = (error as Error).message;
      return result;
    }
  }

  async downloadFile(
    targetIp: string,
    remotePath: string,
    localPath: string,
    connectionType: ConnectionType = 'ssh',
    options: {
      port?: number;
      username?: string;
      password?: string;
      keyFile?: string;
    } = {},
  ): Promise<TransferResult> {
    const result: TransferResult = {
      target_ip: targetIp,
      local_path: localPath,
      remote_path: remotePath,
      timestamp: new Date().toISOString(),
      success: false,
      error: '',
    };

    try {
      if (connectionType !== 'ssh') {
        result.error = `Unsupported connection type: ${connectionType}`;
        return result;
      }

      const session = await this.ensureSshSession(targetIp, options);
      if (!session) {
        result.error = 'SSH connection not available';
        return result;
      }

      const scp = await this.execScpDownload(
        session.host,
        session.port ?? 22,
        session.username ?? '',
        remotePath,
        localPath,
        session.password,
        session.keyFile,
      );
      result.success = scp.code === 0;
      result.error = scp.code === 0 ? '' : scp.stderr || `Download failed with exit code ${scp.code}`;
      return result;
    } catch (error) {
      result.error = (error as Error).message;
      return result;
    }
  }

  disconnect(targetIp: string, connectionType: ConnectionType = 'ssh'): void {
    const key = this.sessionKey(targetIp, connectionType);
    this.activeSessions.delete(key);
  }

  getActiveSessions(): Array<{ target_ip: string; type: string; connected_at: string }> {
    return [...this.activeSessions.entries()].map(([key, session]) => ({
      target_ip: key.split('_').slice(0, -1).join('_') || session.host,
      type: String(session.type),
      connected_at: session.connectedAt,
    }));
  }

  private sessionKey(targetIp: string, connectionType: ConnectionType): string {
    return `${targetIp}_${connectionType}`;
  }

  private async ensureSshSession(
    targetIp: string,
    options: { port?: number; username?: string; password?: string; keyFile?: string },
  ): Promise<RemoteSession | null> {
    const key = this.sessionKey(targetIp, 'ssh');
    const existing = this.activeSessions.get(key);
    if (existing) return existing;

    if (!options.username) return null;
    const ok = await this.connectSsh(
      targetIp,
      options.port ?? 22,
      options.username,
      options.password,
      options.keyFile,
    );
    if (!ok) return null;
    return this.activeSessions.get(key) ?? null;
  }

  private async execSsh(
    host: string,
    port: number,
    username: string,
    command: string,
    password?: string,
    keyFile?: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    if (password && !keyFile) {
      const canPlink = await this.commandExists('plink');
      if (canPlink) {
        return await this.runProcess(
          'plink',
          ['-batch', '-ssh', '-P', String(port), '-l', username, '-pw', password, host, command],
          30_000,
        );
      }
      return {
        code: 1,
        stdout: '',
        stderr: 'Password-based SSH requires plink or key-based auth in current TS implementation.',
      };
    }

    const args = [
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'BatchMode=yes',
      '-p',
      String(port),
    ];
    if (keyFile) {
      args.push('-i', keyFile);
    }
    args.push(`${username}@${host}`, command);
    return await this.runProcess('ssh', args, 30_000);
  }

  private async execWinrm(
    host: string,
    username: string,
    password: string,
    command: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    if (!username || !password) {
      return { code: 1, stdout: '', stderr: 'WinRM requires username and password' };
    }
    return await this.runProcess(
      'winrs',
      [`-r:${host}`, `-u:${username}`, `-p:${password}`, command],
      30_000,
    );
  }

  private async execScpUpload(
    host: string,
    port: number,
    username: string,
    localPath: string,
    remotePath: string,
    password?: string,
    keyFile?: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    if (password && !keyFile) {
      const canPscp = await this.commandExists('pscp');
      if (canPscp) {
        return await this.runProcess(
          'pscp',
          ['-batch', '-P', String(port), '-l', username, '-pw', password, localPath, `${host}:${remotePath}`],
          60_000,
        );
      }
      return {
        code: 1,
        stdout: '',
        stderr: 'Password-based SCP requires pscp or key-based auth in current TS implementation.',
      };
    }

    const args = ['-P', String(port), '-o', 'StrictHostKeyChecking=no'];
    if (keyFile) args.push('-i', keyFile);
    args.push(localPath, `${username}@${host}:${remotePath}`);
    return await this.runProcess('scp', args, 60_000);
  }

  private async execScpDownload(
    host: string,
    port: number,
    username: string,
    remotePath: string,
    localPath: string,
    password?: string,
    keyFile?: string,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    if (password && !keyFile) {
      const canPscp = await this.commandExists('pscp');
      if (canPscp) {
        return await this.runProcess(
          'pscp',
          ['-batch', '-P', String(port), '-l', username, '-pw', password, `${host}:${remotePath}`, localPath],
          60_000,
        );
      }
      return {
        code: 1,
        stdout: '',
        stderr: 'Password-based SCP requires pscp or key-based auth in current TS implementation.',
      };
    }

    const args = ['-P', String(port), '-o', 'StrictHostKeyChecking=no'];
    if (keyFile) args.push('-i', keyFile);
    args.push(`${username}@${host}:${remotePath}`, localPath);
    return await this.runProcess('scp', args, 60_000);
  }

  private runProcess(
    command: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        shell: false,
        windowsHide: true,
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
        resolve({ code: 1, stdout, stderr: stderr || err.message });
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          resolve({ code: 1, stdout, stderr: stderr || 'Process timeout' });
          return;
        }
        resolve({ code: code ?? 1, stdout, stderr });
      });
    });
  }

  private checkTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(ok);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, host);
    });
  }

  private async commandExists(command: string): Promise<boolean> {
    if (this.commandExistsCache.has(command)) {
      return this.commandExistsCache.get(command) as boolean;
    }

    const check = process.platform === 'win32'
      ? await this.runProcess('where', [command], 5_000)
      : await this.runProcess('which', [command], 5_000);
    const ok = check.code === 0;
    this.commandExistsCache.set(command, ok);
    return ok;
  }
}
