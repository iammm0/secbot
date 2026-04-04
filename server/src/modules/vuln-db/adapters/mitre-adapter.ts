import { Logger } from '@nestjs/common';
import { BaseVulnAdapter } from './base-adapter';
import { AttackTechnique, UnifiedVuln, VulnSeverity, VulnSource } from '../schema';

const ENTERPRISE_ATTACK_URL =
  'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';

export class MitreAttackAdapter extends BaseVulnAdapter {
  override source_name = 'mitre_attack';
  private readonly logger = new Logger(MitreAttackAdapter.name);
  private readonly techniqueCache = new Map<string, Record<string, unknown>>();
  private loaded = false;

  constructor(private readonly timeoutMs = 30000) {
    super();
  }

  async load_dataset(): Promise<void> {
    if (this.loaded) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(ENTERPRISE_ATTACK_URL, {
        method: 'GET',
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.debug(`MITRE dataset request failed: HTTP ${response.status}`);
        return;
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const objects = Array.isArray(payload.objects) ? payload.objects : [];

      for (const objRaw of objects) {
        const obj = this.asObj(objRaw);
        if (this.asStr(obj.type) !== 'attack-pattern') continue;
        const refs = this.asArr(obj.external_references);
        for (const refRaw of refs) {
          const ref = this.asObj(refRaw);
          if (this.asStr(ref.source_name) !== 'mitre-attack') continue;
          const techniqueId = this.asStr(ref.external_id).toUpperCase();
          if (!techniqueId) continue;
          this.techniqueCache.set(techniqueId, obj);
          break;
        }
      }
      this.loaded = true;
      this.logger.log(`MITRE ATT&CK loaded: ${this.techniqueCache.size} techniques`);
    } catch (error) {
      this.logger.debug(`MITRE dataset load failed: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  override async fetch_by_id(techniqueId: string): Promise<UnifiedVuln | null> {
    if (!this.loaded) await this.load_dataset();
    const key = techniqueId.toUpperCase();
    const obj = this.techniqueCache.get(key);
    if (!obj) return null;
    return this.normalize(key, obj);
  }

  override async search(keyword: string, limit = 20): Promise<UnifiedVuln[]> {
    if (!this.loaded) await this.load_dataset();
    const key = keyword.toLowerCase();
    if (!key) return [];

    const results: UnifiedVuln[] = [];
    for (const [techniqueId, obj] of this.techniqueCache.entries()) {
      const name = this.asStr(obj.name).toLowerCase();
      const description = this.asStr(obj.description).toLowerCase();
      if (
        name.includes(key) ||
        description.includes(key) ||
        techniqueId.toLowerCase().includes(key)
      ) {
        const vuln = this.normalize(techniqueId, obj);
        if (vuln) results.push(vuln);
      }
      if (results.length >= limit) break;
    }
    return results;
  }

  async get_techniques_for_tactic(tactic: string): Promise<AttackTechnique[]> {
    if (!this.loaded) await this.load_dataset();
    const normalizedTactic = tactic.toLowerCase().replace(/\s+/g, '-');
    const techniques: AttackTechnique[] = [];
    for (const [techniqueId, obj] of this.techniqueCache.entries()) {
      const phases = this.asArr(obj.kill_chain_phases).map((phase) => this.asObj(phase));
      const hasTactic = phases.some(
        (phase) => this.asStr(phase.phase_name).toLowerCase() === normalizedTactic,
      );
      if (!hasTactic) continue;
      techniques.push(this.to_technique(techniqueId, obj));
    }
    return techniques;
  }

  private normalize(techniqueId: string, obj: Record<string, unknown>): UnifiedVuln {
    const technique = this.to_technique(techniqueId, obj);
    const platforms = this.asArr(obj.x_mitre_platforms).map((item) => this.asStr(item));
    const tactics = this.asArr(obj.kill_chain_phases).map((item) =>
      this.asStr(this.asObj(item).phase_name),
    );
    const references = this.asArr(obj.external_references)
      .map((item) => this.asStr(this.asObj(item).url))
      .filter(Boolean)
      .slice(0, 5);

    return new UnifiedVuln({
      vuln_id: techniqueId,
      source: VulnSource.MITRE_ATTACK,
      title: this.asStr(obj.name) || techniqueId,
      description: this.asStr(obj.description).slice(0, 2000),
      severity: VulnSeverity.UNKNOWN,
      attack_techniques: [technique],
      tags: [...platforms, ...tactics].filter(Boolean),
      references,
    });
  }

  private to_technique(techniqueId: string, obj: Record<string, unknown>): AttackTechnique {
    const phases = this.asArr(obj.kill_chain_phases).map((phase) => this.asObj(phase));
    const tactic = this.asStr(phases[0]?.phase_name);
    let url = '';
    for (const refRaw of this.asArr(obj.external_references)) {
      const ref = this.asObj(refRaw);
      if (this.asStr(ref.source_name) === 'mitre-attack') {
        url = this.asStr(ref.url);
        break;
      }
    }
    return {
      technique_id: techniqueId,
      name: this.asStr(obj.name),
      tactic,
      description: this.asStr(obj.description).slice(0, 500),
      url,
    };
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
