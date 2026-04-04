import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { BaseTool, ToolResult } from '../core/base-tool';

const HASH_PATTERNS: Record<string, RegExp> = {
  MD5: /^[a-fA-F0-9]{32}$/,
  'SHA-1': /^[a-fA-F0-9]{40}$/,
  'SHA-256': /^[a-fA-F0-9]{64}$/,
  'SHA-512': /^[a-fA-F0-9]{128}$/,
  'SHA-384': /^[a-fA-F0-9]{96}$/,
  'SHA-224': /^[a-fA-F0-9]{56}$/,
  CRC32: /^[a-fA-F0-9]{8}$/,
};

type HashAction = 'hash' | 'identify' | 'verify';

export class HashTool extends BaseTool {
  constructor() {
    super('hash_tool', 'Calculate, identify and verify hash values.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const action = (params.action as HashAction | undefined) ?? 'hash';
    const text = params.text as string | undefined;
    const filePath = params.file_path as string | undefined;
    const hashValue = (params.hash_value as string | undefined)?.trim();
    const algorithm = ((params.algorithm as string | undefined) ?? 'all').toLowerCase();

    try {
      if (action === 'identify') {
        if (!hashValue) {
          return { success: false, result: null, error: 'Missing parameter: hash_value' };
        }
        const possibleTypes = Object.entries(HASH_PATTERNS)
          .filter(([, pattern]) => pattern.test(hashValue))
          .map(([name]) => name);
        return {
          success: true,
          result: {
            hash_value: hashValue,
            length: hashValue.length,
            possible_types: possibleTypes,
          },
        };
      }

      const data = await this.readInput(text, filePath);
      if (!data) {
        return { success: false, result: null, error: 'Provide either text or file_path' };
      }

      const hashes = this.computeHashes(data, algorithm);
      if (action === 'verify') {
        if (!hashValue) {
          return { success: false, result: null, error: 'Missing parameter: hash_value' };
        }
        const matchedAlgorithm =
          Object.entries(hashes).find(([, v]) => v.toLowerCase() === hashValue.toLowerCase())?.[0] ?? null;
        return {
          success: true,
          result: {
            match: Boolean(matchedAlgorithm),
            matched_algorithm: matchedAlgorithm,
            expected: hashValue,
            computed: hashes,
          },
        };
      }

      return {
        success: true,
        result: {
          source: text ? 'text' : filePath,
          size_bytes: data.length,
          hashes,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private async readInput(text?: string, filePath?: string): Promise<Buffer | null> {
    if (typeof text === 'string' && text.length > 0) {
      return Buffer.from(text, 'utf8');
    }
    if (typeof filePath === 'string' && filePath.length > 0) {
      return await fs.readFile(filePath);
    }
    return null;
  }

  private computeHashes(data: Buffer, algorithm: string): Record<string, string> {
    const all = ['md5', 'sha1', 'sha256', 'sha512'];
    const selected = algorithm === 'all' ? all : [algorithm];
    const result: Record<string, string> = {};
    for (const algo of selected) {
      result[algo.toUpperCase()] = createHash(algo).update(data).digest('hex');
    }
    return result;
  }
}

