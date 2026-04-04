import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BaseTool, ToolResult } from '../core/base-tool';

const MAGIC_SIGNATURES: Array<{ signature: Buffer; description: string }> = [
  { signature: Buffer.from([0x89, 0x50, 0x4e, 0x47]), description: 'PNG image' },
  { signature: Buffer.from([0xff, 0xd8, 0xff]), description: 'JPEG image' },
  { signature: Buffer.from('GIF87a', 'ascii'), description: 'GIF image' },
  { signature: Buffer.from('GIF89a', 'ascii'), description: 'GIF image' },
  { signature: Buffer.from('PK\x03\x04', 'binary'), description: 'ZIP/Office archive' },
  { signature: Buffer.from('%PDF', 'ascii'), description: 'PDF document' },
  { signature: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), description: 'ELF binary' },
  { signature: Buffer.from('MZ', 'ascii'), description: 'PE executable' },
];

export class FileAnalyzeTool extends BaseTool {
  constructor() {
    super('file_analyze', 'Analyze file metadata, hashes, magic bytes and suspicious patterns.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const filePath = params.path as string | undefined;
    const deep = Boolean(params.deep);
    if (!filePath) {
      return { success: false, result: null, error: 'Missing parameter: path' };
    }

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return { success: false, result: null, error: 'Path is not a regular file' };
      }

      const ext = path.extname(filePath).toLowerCase();
      const content = stat.size <= 100 * 1024 * 1024 ? await fs.readFile(filePath) : null;

      const hashes =
        content === null
          ? 'File too large, hash skipped'
          : {
              md5: createHash('md5').update(content).digest('hex'),
              sha1: createHash('sha1').update(content).digest('hex'),
              sha256: createHash('sha256').update(content).digest('hex'),
            };

      const header = content?.subarray(0, 16) ?? Buffer.alloc(0);

      const result: Record<string, unknown> = {
        path: path.resolve(filePath),
        name: path.basename(filePath),
        extension: ext,
        size_bytes: stat.size,
        size_human: this.humanSize(stat.size),
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
        accessed: stat.atime.toISOString(),
        mode: stat.mode.toString(8).slice(-3),
        hashes,
        magic_bytes: header.toString('hex'),
        detected_type: this.detectType(header),
      };

      if (deep && content && content.length <= 10 * 1024 * 1024) {
        result.deep_analysis = this.deepAnalyze(content);
      }

      return { success: true, result };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private detectType(header: Buffer): string {
    for (const item of MAGIC_SIGNATURES) {
      if (header.subarray(0, item.signature.length).equals(item.signature)) {
        return item.description;
      }
    }
    return 'Unknown';
  }

  private deepAnalyze(content: Buffer): Record<string, unknown> {
    const text = content.toString('utf8');
    const suspiciousRules: Record<string, string[]> = {
      shell_command: ['#!/bin/sh', '#!/bin/bash', '/bin/sh', 'exec(', 'eval(', 'system('],
      encoded_payload: ['\\x', '\\u00', 'fromCharCode'],
      sql_injection: ['UNION SELECT', 'DROP TABLE', "' OR '1'='1"],
    };

    const suspicious_patterns: Array<{ category: string; pattern: string }> = [];
    for (const [category, patterns] of Object.entries(suspiciousRules)) {
      for (const pattern of patterns) {
        if (text.toLowerCase().includes(pattern.toLowerCase())) {
          suspicious_patterns.push({ category, pattern });
        }
      }
    }

    const nullBytes = content.filter((b) => b === 0x00).length;
    return {
      line_count: text.split('\n').length,
      null_bytes: nullBytes,
      is_text: nullBytes < content.length * 0.1,
      entropy: this.entropy(content),
      suspicious_patterns,
    };
  }

  private entropy(content: Buffer): number {
    if (content.length === 0) return 0;
    const counts = new Map<number, number>();
    for (const byte of content) {
      counts.set(byte, (counts.get(byte) ?? 0) + 1);
    }
    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / content.length;
      entropy -= p * Math.log2(p);
    }
    return Number(entropy.toFixed(4));
  }

  private humanSize(size: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(1)} ${units[idx]}`;
  }
}
