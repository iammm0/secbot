import { UnifiedVuln } from '../schema';

export abstract class BaseVulnAdapter {
  source_name = 'unknown';

  abstract fetch_by_id(vulnId: string): Promise<UnifiedVuln | null>;

  abstract search(keyword: string, limit?: number): Promise<UnifiedVuln[]>;

  async fetch_batch(ids: string[]): Promise<UnifiedVuln[]> {
    const result: UnifiedVuln[] = [];
    for (const id of ids) {
      const vuln = await this.fetch_by_id(id);
      if (vuln) result.push(vuln);
    }
    return result;
  }
}
