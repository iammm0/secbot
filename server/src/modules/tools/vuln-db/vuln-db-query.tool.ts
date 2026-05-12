import { BaseTool, ToolResult } from '../core/base-tool';
import { VulnDbService } from '../../vuln-db/vuln-db.service';
import { UnifiedVuln } from '../../vuln-db/schema';

interface VulnDbQueryParams {
  cve_id?: string;
  query?: string;
  scan_result?: Record<string, unknown>;
  limit?: number;
}

/**
 * 让 Agent 直接接入开源漏洞库（NVD / CVE.org / Exploit-DB / MITRE ATT&CK）的 BaseTool。
 *
 * 三种使用方式（互斥优先级：cve_id > scan_result > query）：
 * - 精确 ID：cve_id="CVE-2021-44228"
 * - 扫描结果映射：scan_result={ type, description, severity, ... }
 * - 自然语言/产品关键字：query="log4j RCE 2.14.1"
 *
 * 设计取舍：返回时把 UnifiedVuln 精简到 Agent 真正需要的字段，避免把上千字的 raw_data 灌进 LLM。
 */
export class VulnDbQueryTool extends BaseTool {
  constructor(private readonly vulnDb: VulnDbService) {
    super(
      'vuln_db_query',
      [
        'Query CVE/NVD/Exploit-DB/MITRE ATT&CK in one call.',
        'params: { cve_id?: "CVE-YYYY-NNNN", query?: "free text or product@version", scan_result?: object, limit?: number }',
        'Use this whenever the user mentions a CVE id, product+version, or asks "is this vulnerable / known exploit?".',
      ].join('\n'),
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const p = params as VulnDbQueryParams;
    const cveId = (p.cve_id ?? '').toString().trim();
    const query = (p.query ?? '').toString().trim();
    const scanResult = p.scan_result && typeof p.scan_result === 'object' ? p.scan_result : null;
    const limit = clampInt(p.limit, 5, 1, 20);

    if (!cveId && !query && !scanResult) {
      return {
        success: false,
        result: null,
        error: '至少提供 cve_id / query / scan_result 三者之一',
      };
    }

    try {
      if (cveId) {
        const vuln = await this.vulnDb.search_by_cve_id(cveId);
        return {
          success: !!vuln,
          result: vuln
            ? { mode: 'by_cve_id', cve_id: cveId, vuln: this.summarizeVuln(vuln) }
            : { mode: 'by_cve_id', cve_id: cveId, vuln: null, hint: '未在 NVD/CVE.org 命中' },
        };
      }

      if (scanResult) {
        const mapping = await this.vulnDb.search_by_scan_result(
          scanResult as Record<string, unknown>,
          limit,
        );
        return {
          success: true,
          result: {
            mode: 'by_scan_result',
            scan_vuln_type: mapping.scan_vuln_type,
            scan_description: mapping.scan_description,
            match_score: mapping.match_score,
            matched_vulns: mapping.matched_vulns.map((v) => this.summarizeVuln(v)),
          },
        };
      }

      const list = await this.vulnDb.search_natural_language(query, limit);
      return {
        success: true,
        result: {
          mode: 'by_query',
          query,
          matched_count: list.length,
          matched_vulns: list.map((v) => this.summarizeVuln(v)),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, result: null, error: `vuln_db_query 失败: ${msg}` };
    }
  }

  private summarizeVuln(v: UnifiedVuln): Record<string, unknown> {
    const products = v.affected_software.slice(0, 5).map((item) => ({
      vendor: item.vendor,
      product: item.product,
      versions: item.versions.slice(0, 8),
    }));
    const exploits = v.exploits.slice(0, 5).map((item) => ({
      title: item.title,
      url: item.url,
      type: item.exploit_type,
      verified: item.verified,
      source: item.source,
    }));
    const techniques = v.attack_techniques.slice(0, 5).map((item) => ({
      id: item.technique_id,
      name: item.name,
      tactic: item.tactic,
    }));
    const mitigations = v.mitigations.slice(0, 5).map((item) => ({
      description: item.description.slice(0, 200),
      patch_available: item.patch_available,
      url: item.url,
    }));

    return {
      vuln_id: v.vuln_id,
      source: v.source,
      title: v.title,
      severity: v.severity,
      cvss: v.cvss_score,
      cvss_vector: v.cvss_vector,
      summary: v.description.slice(0, 500),
      affected: products,
      exploits,
      attack_techniques: techniques,
      mitigations,
      references: v.references.slice(0, 10),
      tags: v.tags.slice(0, 10),
      date_published: v.date_published,
      date_modified: v.date_modified,
    };
  }
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
