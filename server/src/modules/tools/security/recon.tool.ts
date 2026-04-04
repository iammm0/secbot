import * as dns from 'dns';
import { BaseTool, ToolResult } from '../core/base-tool';

export class ReconTool extends BaseTool {
  constructor() {
    super('recon', '信息收集 — 收集目标的基本信息（DNS、WHOIS等）');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const target = params.target as string;
      if (!target) {
        return { success: false, result: null, error: '缺少必要参数: target' };
      }

      let ips: string[] = [];
      try {
        ips = await dns.promises.resolve4(target);
      } catch {
        ips = [];
      }

      return {
        success: true,
        result: { target, ips, info: 'basic recon completed' },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `信息收集失败: ${(error as Error).message}`,
      };
    }
  }
}
