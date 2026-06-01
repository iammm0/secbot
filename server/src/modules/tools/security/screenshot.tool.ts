import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BaseTool, ToolResult } from '../core/base-tool';

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'chromium',
  'google-chrome',
];

export class ScreenshotTool extends BaseTool {
  constructor() {
    super('screenshot', '页面截图 — 使用 headless Chrome 对目标 URL 进行截图');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = String(params.url ?? '').trim();
    if (!url) {
      return { success: false, result: null, error: '缺少必要参数: url' };
    }

    const width = Math.min(Number(params.width) || 1280, 3840);
    const height = Math.min(Number(params.height) || 720, 2160);
    const fullPage = params.full_page === true;
    const timeoutSec = Math.min(Number(params.timeout) || 30, 120);

    let outputPath = params.output_path ? String(params.output_path).trim() : '';
    if (!outputPath) {
      const dir = await mkdtemp(join(tmpdir(), 'secbot-screenshot-'));
      outputPath = join(dir, 'screenshot.png');
    }

    const chromePath = await this.findChrome();
    if (!chromePath) {
      return {
        success: false,
        result: null,
        error: 'Chrome/Chromium 未找到。请安装 Google Chrome 或 Chromium',
      };
    }

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`,
    ];

    if (fullPage) {
      args.push('--full-page-screenshot');
    }

    args.push(url);

    const result = await this.exec(chromePath, args, timeoutSec);
    if (result.error) {
      return { success: false, result: null, error: result.error };
    }

    return {
      success: true,
      result: {
        url,
        output_path: outputPath,
        viewport: { width, height },
        full_page: fullPage,
        note: '截图已保存',
      },
    };
  }

  private async findChrome(): Promise<string | null> {
    for (const p of CHROME_PATHS) {
      try {
        const ok = await this.canExec(p);
        if (ok) return p;
      } catch {
        /* next */
      }
    }
    return null;
  }

  private canExec(bin: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(bin, ['--version'], { shell: false, windowsHide: true });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
      child.stdout.resume();
      child.stderr.resume();
    });
  }

  private exec(
    bin: string,
    args: string[],
    timeoutSec: number,
  ): Promise<{ code: number; stdout: string; stderr: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn(bin, args, { shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let done = false;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c) => {
        stdout += c;
      });
      child.stderr.on('data', (c) => {
        stderr += c;
      });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        resolve({ code: -1, stdout, stderr, error: `截图超时 (${timeoutSec}s)` });
      }, timeoutSec * 1000);

      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr, error: err.message });
      });

      child.on('close', (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (code !== 0) {
          resolve({
            code: code ?? -1,
            stdout,
            stderr,
            error: stderr.trim() || `Chrome 退出码 ${code}`,
          });
        } else {
          resolve({ code: 0, stdout, stderr });
        }
      });
    });
  }
}
