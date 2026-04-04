import { spawn } from 'node:child_process';
import os from 'node:os';
import { BaseTool, ToolResult } from '../core/base-tool';

type Dict = Record<string, unknown>;

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return fallback;
}

function runCommand(command: string, args: string[], timeoutSec = 6): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let done = false;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill('SIGTERM');
      resolve(stdout || stderr);
    }, Math.max(1, timeoutSec) * 1000);

    child.on('error', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve('');
    });

    child.on('close', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(stdout || stderr);
    });
  });
}

function parseWindowsTasklist(output: string): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('"')) continue;
    const fields = trimmed
      .split(/","/g)
      .map((part) => part.replace(/^"/, '').replace(/"$/, '').trim());
    if (fields.length < 5) continue;
    result.push({
      image: fields[0],
      pid: Number(fields[1]) || fields[1],
      session_name: fields[2],
      session_number: fields[3],
      memory: fields[4],
    });
  }
  return result;
}

function parseUnixPs(output: string): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/, 6);
    if (parts.length < 6) continue;
    result.push({
      pid: Number(parts[0]) || parts[0],
      ppid: Number(parts[1]) || parts[1],
      user: parts[2],
      cpu: parts[3],
      mem: parts[4],
      command: parts[5],
    });
  }
  return result;
}

export class SystemInfoTool extends BaseTool {
  constructor() {
    super(
      'system_info',
      'Collect host system information: OS, CPU/memory, network interfaces, process sample and user info.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const category = String(params.category ?? 'all').toLowerCase();
    const includeEnv = parseBool(params.include_env, false);
    const result: Dict = {};
    const errors: string[] = [];

    try {
      if (category === 'all' || category === 'system') {
        result.system = this.collectSystemInfo(includeEnv);
      }
      if (category === 'all' || category === 'network') {
        result.network = this.collectNetworkInfo();
      }
      if (category === 'all' || category === 'process') {
        try {
          result.processes = await this.collectProcessInfo();
        } catch (error) {
          errors.push(`processes: ${(error as Error).message}`);
        }
      }
      if (category === 'all' || category === 'user') {
        result.users = this.collectUserInfo();
      }

      if (errors.length > 0) {
        result._partial_errors = errors;
      }

      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: (error as Error).message,
      };
    }
  }

  private collectSystemInfo(includeEnv: boolean): Dict {
    const cpus = os.cpus();
    const data: Dict = {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptime_sec: os.uptime(),
      loadavg: os.loadavg(),
      cpu_count: cpus.length,
      cpu_model: cpus[0]?.model ?? 'unknown',
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
      },
      node: {
        version: process.version,
        pid: process.pid,
      },
    };

    if (includeEnv) {
      data.env = {
        NODE_ENV: process.env.NODE_ENV ?? null,
        SHELL: process.env.SHELL ?? process.env.ComSpec ?? null,
      };
    }
    return data;
  }

  private collectNetworkInfo(): Dict {
    const interfaces = os.networkInterfaces();
    const normalized: Dict = {};
    for (const [name, items] of Object.entries(interfaces)) {
      normalized[name] = (items ?? []).map((item) => ({
        family: item.family,
        address: item.address,
        netmask: item.netmask,
        mac: item.mac,
        internal: item.internal,
        cidr: item.cidr,
      }));
    }
    return normalized;
  }

  private async collectProcessInfo(): Promise<Dict> {
    let sample: Array<Record<string, unknown>> = [];

    if (process.platform === 'win32') {
      const output = await runCommand('tasklist', ['/fo', 'csv', '/nh'], 8);
      sample = parseWindowsTasklist(output).slice(0, 120);
    } else {
      const output = await runCommand('ps', ['-eo', 'pid,ppid,user,pcpu,pmem,comm', '--no-headers'], 8);
      sample = parseUnixPs(output).slice(0, 120);
    }

    return {
      self: {
        pid: process.pid,
        ppid: process.ppid,
        title: process.title,
        memory: process.memoryUsage(),
      },
      total_sampled: sample.length,
      sample,
    };
  }

  private collectUserInfo(): Dict {
    const info = os.userInfo();
    return {
      username: info.username,
      homedir: info.homedir,
      shell: info.shell,
      uid: info.uid,
      gid: info.gid,
      env_user: process.env.USERNAME ?? process.env.USER ?? null,
    };
  }
}
