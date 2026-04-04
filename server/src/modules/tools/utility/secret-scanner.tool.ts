import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BaseTool, ToolResult } from '../core/base-tool';

const DEFAULT_PATTERNS: Record<string, RegExp> = {
  aws_access_key: /AKIA[0-9A-Z]{16}/,
  github_token: /gh[pousr]_[A-Za-z0-9_]{20,255}/,
  generic_api_key: /(api[_-]?key|apikey|api_secret)[\s=:"]+[A-Za-z0-9\-_]{16,64}/i,
  generic_secret: /(secret|password|passwd|pwd|token)[\s]*[=:]+[\s]*['"][^\s'"]{8,}['"]/i,
  private_key: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  jwt: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  google_api_key: /AIza[0-9A-Za-z\-_]{35}/,
  bearer_token: /bearer[\s]+[A-Za-z0-9\-_.]{20,}/i,
};

const IGNORE_DIRS = new Set([
  '.git',
  '__pycache__',
  'node_modules',
  '.venv',
  'venv',
  '.tox',
  'dist',
  'build',
  '.idea',
  '.vscode',
]);

const IGNORE_EXTENSIONS = new Set([
  '.pyc',
  '.pyo',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.ico',
  '.svg',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
]);

export class SecretScannerTool extends BaseTool {
  constructor() {
    super('secret_scanner', 'Scan files/directories for potential secrets and tokens.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = params.path as string | undefined;
    const maxFiles = Number(params.max_files ?? 500);
    const customPatterns = params.patterns as Array<{ name: string; pattern: string }> | undefined;

    if (!target) {
      return { success: false, result: null, error: 'Missing parameter: path' };
    }

    try {
      const stat = await fs.stat(target);
      const patterns = this.buildPatterns(customPatterns);

      const findings: Array<Record<string, unknown>> = [];
      const errors: string[] = [];
      let filesScanned = 0;

      if (stat.isFile()) {
        filesScanned = 1;
        findings.push(...(await this.scanFile(target, patterns)));
      } else {
        const files = await this.walk(target, maxFiles);
        filesScanned = files.length;
        for (const file of files) {
          try {
            findings.push(...(await this.scanFile(file, patterns)));
          } catch (error) {
            errors.push(`${file}: ${(error as Error).message}`);
          }
        }
      }

      const unique = new Map<string, Record<string, unknown>>();
      for (const item of findings) {
        const key = `${item.file}:${item.line}:${item.rule}`;
        if (!unique.has(key)) unique.set(key, item);
      }

      return {
        success: true,
        result: {
          path: target,
          files_scanned: filesScanned,
          findings_count: unique.size,
          findings: [...unique.values()].slice(0, 100),
          errors: errors.slice(0, 10),
          rules_used: patterns.length,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private buildPatterns(
    customPatterns?: Array<{ name: string; pattern: string }>,
  ): Array<{ name: string; regex: RegExp }> {
    const output = Object.entries(DEFAULT_PATTERNS).map(([name, regex]) => ({ name, regex }));
    for (const p of customPatterns ?? []) {
      try {
        output.push({ name: p.name, regex: new RegExp(p.pattern, 'i') });
      } catch {
        // ignore invalid custom regex
      }
    }
    return output;
  }

  private async walk(root: string, maxFiles: number): Promise<string[]> {
    const queue: string[] = [root];
    const files: string[] = [];

    while (queue.length > 0 && files.length < maxFiles) {
      const current = queue.shift() as string;
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name)) {
            queue.push(path.join(current, entry.name));
          }
          continue;
        }
        if (!entry.isFile()) continue;
        const full = path.join(current, entry.name);
        if (IGNORE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
        const stat = await fs.stat(full);
        if (stat.size > 1_000_000) continue;
        files.push(full);
      }
    }
    return files;
  }

  private async scanFile(
    filePath: string,
    patterns: Array<{ name: string; regex: RegExp }>,
  ): Promise<Array<Record<string, unknown>>> {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const findings: Array<Record<string, unknown>> = [];

    lines.forEach((line, idx) => {
      for (const rule of patterns) {
        const match = line.match(rule.regex);
        if (!match) continue;
        const raw = match[0];
        const masked =
          raw.length > 8
            ? `${raw.slice(0, 4)}${'*'.repeat(raw.length - 8)}${raw.slice(-4)}`
            : `${raw.slice(0, 2)}***`;
        findings.push({
          file: filePath,
          line: idx + 1,
          rule: rule.name,
          matched: masked,
          context: line.trim().slice(0, 140),
        });
      }
    });
    return findings;
  }
}

