import { Logger } from '@nestjs/common';
import { BaseVulnAdapter } from './base-adapter';
import { AffectedProduct, ExploitRef, UnifiedVuln, VulnSeverity, VulnSource } from '../schema';

const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

const SEVERITY_MAP: Record<string, VulnSeverity> = {
  CRITICAL: VulnSeverity.CRITICAL,
  HIGH: VulnSeverity.HIGH,
  MEDIUM: VulnSeverity.MEDIUM,
  LOW: VulnSeverity.LOW,
  NONE: VulnSeverity.INFO,
};

export class NvdAdapter extends BaseVulnAdapter {
  override source_name = 'nvd';
  private readonly logger = new Logger(NvdAdapter.name);

  constructor(
    private readonly apiKey: string | null = null,
    private readonly timeoutMs = 20000,
  ) {
    super();
  }

  override async fetch_by_id(cveId: string): Promise<UnifiedVuln | null> {
    const url = `${NVD_API_BASE}?cveId=${encodeURIComponent(cveId)}`;
    const payload = await this.fetch_json(url);
    if (!payload) return null;
    const items = this.asArr(this.asObj(payload).vulnerabilities);
    if (!items.length) return null;
    return this.normalize(this.asObj(items[0]));
  }

  override async search(keyword: string, limit = 20): Promise<UnifiedVuln[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const url =
      `${NVD_API_BASE}?keywordSearch=${encodeURIComponent(keyword)}` +
      `&resultsPerPage=${safeLimit}`;
    const payload = await this.fetch_json(url);
    if (!payload) return [];

    const items = this.asArr(this.asObj(payload).vulnerabilities);
    const results: UnifiedVuln[] = [];
    for (const item of items.slice(0, safeLimit)) {
      const normalized = this.normalize(this.asObj(item));
      if (normalized) results.push(normalized);
    }
    return results;
  }

  async search_by_cpe(cpeName: string, limit = 20): Promise<UnifiedVuln[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const url =
      `${NVD_API_BASE}?cpeName=${encodeURIComponent(cpeName)}` + `&resultsPerPage=${safeLimit}`;
    const payload = await this.fetch_json(url);
    if (!payload) return [];
    const items = this.asArr(this.asObj(payload).vulnerabilities);
    return items
      .slice(0, safeLimit)
      .map((item) => this.normalize(this.asObj(item)))
      .filter((item): item is UnifiedVuln => item !== null);
  }

  private async fetch_json(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'secbot-ts/2.0.0',
      };
      if (this.apiKey?.trim()) {
        headers.apiKey = this.apiKey.trim();
      }
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.debug(`NVD API error ${response.status} for ${url}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      this.logger.debug(`NVD API request failed: ${(error as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private normalize(item: Record<string, unknown>): UnifiedVuln | null {
    const cve = this.asObj(item.cve);
    const cveId = this.asStr(cve.id);
    if (!cveId) return null;

    const description = this.pickEnglishDescription(this.asArr(cve.descriptions));

    let cvssScore: number | null = null;
    let cvssVector: string | null = null;
    let severity = VulnSeverity.UNKNOWN;

    const metrics = this.asObj(cve.metrics);
    for (const key of ['cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']) {
      const metricList = this.asArr(metrics[key]);
      if (!metricList.length) continue;
      const metric = this.asObj(metricList[0]);
      const cvssData = this.asObj(metric.cvssData);
      if (typeof cvssData.baseScore === 'number') {
        cvssScore = cvssData.baseScore as number;
      }
      const vector = this.asStr(cvssData.vectorString);
      if (vector) cvssVector = vector;

      const sev =
        this.asStr(metric.baseSeverity).toUpperCase() ||
        this.asStr(cvssData.baseSeverity).toUpperCase();
      if (SEVERITY_MAP[sev]) severity = SEVERITY_MAP[sev];
      break;
    }

    const affected: AffectedProduct[] = [];
    for (const configRaw of this.asArr(cve.configurations)) {
      const config = this.asObj(configRaw);
      for (const nodeRaw of this.asArr(config.nodes)) {
        const node = this.asObj(nodeRaw);
        for (const matchRaw of this.asArr(node.cpeMatch)) {
          const match = this.asObj(matchRaw);
          const cpeUri = this.asStr(match.criteria);
          if (!cpeUri) continue;
          const segments = cpeUri.split(':');
          affected.push({
            vendor: segments[3] ?? '',
            product: segments[4] ?? '',
            versions: segments[5] && segments[5] !== '*' ? [segments[5]] : [],
            cpe: cpeUri,
          });
        }
      }
    }

    const tags: string[] = [];
    for (const weaknessRaw of this.asArr(cve.weaknesses)) {
      const weakness = this.asObj(weaknessRaw);
      for (const descRaw of this.asArr(weakness.description)) {
        const value = this.asStr(this.asObj(descRaw).value);
        if (value && !tags.includes(value)) tags.push(value);
      }
    }

    const references = this.asArr(cve.references)
      .map((itemRef) => this.asStr(this.asObj(itemRef).url))
      .filter(Boolean)
      .slice(0, 10);

    const exploits: ExploitRef[] = [];
    for (const refRaw of this.asArr(cve.references)) {
      const ref = this.asObj(refRaw);
      const refUrl = this.asStr(ref.url);
      const refTags = this.asArr(ref.tags).map((tag) => this.asStr(tag));
      if (!refUrl) continue;
      if (refTags.includes('Exploit') || refTags.includes('Third Party Advisory')) {
        exploits.push({
          url: refUrl,
          title: refUrl.split('/').pop() ?? refUrl,
          exploit_type: 'reference',
          tool: '',
          verified: false,
          source: this.asStr(ref.source),
        });
      }
    }

    return new UnifiedVuln({
      vuln_id: cveId,
      source: VulnSource.NVD,
      title: cveId,
      description: description.slice(0, 2000),
      affected_software: affected.slice(0, 20),
      severity,
      cvss_score: cvssScore,
      cvss_vector: cvssVector,
      exploits,
      references,
      tags,
      date_published: this.parseDate(this.asStr(cve.published)),
      date_modified: this.parseDate(this.asStr(cve.lastModified)),
      state: this.asStr(cve.vulnStatus),
    });
  }

  private pickEnglishDescription(items: unknown[]): string {
    for (const itemRaw of items) {
      const item = this.asObj(itemRaw);
      if (this.asStr(item.lang).toLowerCase() === 'en') {
        return this.asStr(item.value);
      }
    }
    return this.asStr(this.asObj(items[0]).value);
  }

  private parseDate(raw: string): string | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  private asObj(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  private asArr(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asStr(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
