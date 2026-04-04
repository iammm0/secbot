import { Injectable } from '@nestjs/common';
import {
  BlockedIpsResponseDto,
  DefenseReportResponseDto,
  DefenseScanResponseDto,
  DefenseStatusResponseDto,
  UnblockRequestDto,
  UnblockResponseDto,
} from './dto/defense.dto';
import { PortScannerTool } from '../tools/security/port-scanner.tool';
import { HeaderAnalyzerTool } from '../tools/security/header-analyzer.tool';

@Injectable()
export class DefenseService {
  private blockedIps: Set<string> = new Set();
  private monitoring = false;
  private detectedAttacks = 0;

  async scan(): Promise<DefenseScanResponseDto> {
    const scanner = new PortScannerTool();
    const headerAnalyzer = new HeaderAnalyzerTool();

    const portResult = await scanner.run({ host: '127.0.0.1' });
    const headerResult = await headerAnalyzer.run({ url: 'http://127.0.0.1:8000' });

    return {
      success: true,
      report: {
        portScan: portResult.result,
        headerAnalysis: headerResult.result,
        timestamp: new Date().toISOString(),
      },
    };
  }

  async status(): Promise<DefenseStatusResponseDto> {
    return {
      monitoring: this.monitoring,
      autoResponse: false,
      blockedIps: this.blockedIps.size,
      vulnerabilities: 0,
      detectedAttacks: this.detectedAttacks,
      maliciousIps: 0,
      statistics: {},
    };
  }

  async blocked(): Promise<BlockedIpsResponseDto> {
    return { blockedIps: [...this.blockedIps] };
  }

  async unblock(body: UnblockRequestDto): Promise<UnblockResponseDto> {
    const deleted = this.blockedIps.delete(body.ip);
    return {
      success: deleted,
      message: deleted
        ? `已解封 IP: ${body.ip}`
        : `IP 未封禁: ${body.ip}`,
    };
  }

  async report(type: string): Promise<DefenseReportResponseDto> {
    if (type === 'full') {
      return {
        success: false,
        report: { message: '完整报告需要先执行扫描，请调用 POST /api/defense/scan' },
      };
    }
    return {
      success: true,
      report: { type, blockedIps: this.blockedIps.size, detectedAttacks: this.detectedAttacks },
    };
  }
}
