export enum VulnSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
  UNKNOWN = 'unknown',
}

export enum VulnSource {
  CVE = 'cve',
  NVD = 'nvd',
  EXPLOIT_DB = 'exploit_db',
  MITRE_ATTACK = 'mitre_attack',
  SCAN = 'scan',
}

export interface AffectedProduct {
  vendor: string;
  product: string;
  versions: string[];
  cpe?: string | null;
}

export interface ExploitRef {
  url: string;
  title: string;
  exploit_type: string;
  tool: string;
  verified: boolean;
  source: string;
}

export interface AttackTechnique {
  technique_id: string;
  name: string;
  tactic: string;
  description: string;
  url: string;
}

export interface Mitigation {
  description: string;
  url: string;
  patch_available: boolean;
}

export type UnifiedVulnInit = Partial<UnifiedVuln> & { vuln_id: string };

export class UnifiedVuln {
  vuln_id: string;
  source: VulnSource;
  title: string;
  description: string;
  affected_software: AffectedProduct[];
  severity: VulnSeverity;
  cvss_score: number | null;
  cvss_vector: string | null;
  exploits: ExploitRef[];
  attack_techniques: AttackTechnique[];
  mitigations: Mitigation[];
  references: string[];
  tags: string[];
  date_published: string | null;
  date_modified: string | null;
  state: string;
  raw_data: Record<string, unknown> | null;

  constructor(init: UnifiedVulnInit) {
    this.vuln_id = init.vuln_id;
    this.source = init.source ?? VulnSource.CVE;
    this.title = init.title ?? '';
    this.description = init.description ?? '';
    this.affected_software = init.affected_software ?? [];
    this.severity = init.severity ?? VulnSeverity.UNKNOWN;
    this.cvss_score = init.cvss_score ?? null;
    this.cvss_vector = init.cvss_vector ?? null;
    this.exploits = init.exploits ?? [];
    this.attack_techniques = init.attack_techniques ?? [];
    this.mitigations = init.mitigations ?? [];
    this.references = init.references ?? [];
    this.tags = init.tags ?? [];
    this.date_published = init.date_published ?? null;
    this.date_modified = init.date_modified ?? null;
    this.state = init.state ?? '';
    this.raw_data = init.raw_data ?? null;
  }

  build_embedding_text(): string {
    const parts: string[] = [this.vuln_id, this.title, this.description];

    for (const product of this.affected_software) {
      parts.push(
        `${product.vendor} ${product.product} ${product.versions.slice(0, 5).join(' ')}`.trim(),
      );
    }

    for (const exploit of this.exploits) {
      parts.push(exploit.title || exploit.url);
    }

    for (const technique of this.attack_techniques) {
      parts.push(`${technique.technique_id} ${technique.name} ${technique.tactic}`.trim());
    }

    parts.push(this.severity);
    if (this.cvss_score !== null) {
      parts.push(`CVSS ${this.cvss_score}`);
    }

    for (const tag of this.tags) {
      parts.push(tag);
    }

    return parts.filter(Boolean).join(' | ');
  }

  to_summary(): string {
    const lines: string[] = [
      `[${this.vuln_id}] ${this.title || '(no title)'}`,
      `  Severity: ${this.severity.toUpperCase()}  CVSS: ${this.cvss_score ?? 'N/A'}`,
      `  Description: ${(this.description ?? '').slice(0, 200)}`,
    ];
    if (this.affected_software.length) {
      const products = this.affected_software
        .slice(0, 3)
        .map((item) => `${item.vendor}/${item.product}`)
        .join(', ');
      lines.push(`  Affected: ${products}`);
    }
    if (this.exploits.length) {
      lines.push(`  Exploits: ${this.exploits.length}`);
    }
    return lines.join('\n');
  }
}

export interface ScanVulnMapping {
  scan_vuln_type: string;
  scan_description: string;
  matched_vulns: UnifiedVuln[];
  match_score: number;
}

