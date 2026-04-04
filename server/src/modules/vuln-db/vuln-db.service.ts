import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BaseVulnAdapter,
  CveAdapter,
  ExploitDBAdapter,
  MitreAttackAdapter,
  NvdAdapter,
} from './adapters';
import {
  ScanVulnMapping,
  UnifiedVuln,
  VulnSource,
} from './schema';
import { VulnVectorStore } from './vuln-vector-store.service';

const CVE_PATTERN = /CVE-\d{4}-\d{4,}/gi;

@Injectable()
export class VulnDbService implements OnModuleDestroy {
  private readonly logger = new Logger(VulnDbService.name);
  private readonly vectorStore: VulnVectorStore;
  private readonly adapters: Record<string, BaseVulnAdapter>;
  private readonly dimension: number;
  private readonly embeddingBaseUrl: string;
  private readonly embeddingModel: string;
  private readonly embeddingTimeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.dimension = this.resolveDimension();
    this.vectorStore = new VulnVectorStore(
      process.env.VULN_VECTOR_DB_PATH?.trim() || 'data/vuln_vectors.db',
      this.dimension,
    );

    const nvdApiKey =
      this.config.get<string>('app.nvdApiKey') ??
      process.env.NVD_API_KEY?.trim() ??
      null;

    this.adapters = {
      cve: new CveAdapter(),
      nvd: new NvdAdapter(nvdApiKey),
      exploit_db: new ExploitDBAdapter(),
      mitre_attack: new MitreAttackAdapter(),
    };

    this.embeddingBaseUrl =
      process.env.OLLAMA_BASE_URL?.trim() ||
      this.config.get<string>('app.ollamaBaseUrl') ||
      'http://localhost:11434';
    this.embeddingModel =
      process.env.OLLAMA_EMBEDDING_MODEL?.trim() ||
      this.config.get<string>('app.ollamaEmbeddingModel') ||
      'nomic-embed-text';
    this.embeddingTimeoutMs = 15000;
  }

  async search_by_cve_id(cveId: string): Promise<UnifiedVuln | null> {
    const normalized = cveId.trim().toUpperCase();
    if (!normalized) return null;

    for (const name of ['nvd', 'cve']) {
      const adapter = this.adapters[name];
      if (!adapter) continue;
      const vuln = await adapter.fetch_by_id(normalized);
      if (!vuln) continue;
      await this.index_vulns([vuln]);
      return vuln;
    }
    return null;
  }

  async search_by_scan_result(
    scanResult: Record<string, unknown>,
    limit = 5,
  ): Promise<ScanVulnMapping> {
    const safeLimit = Math.max(1, limit);
    const vulnType = this.asStr(scanResult.type);
    const description = this.asStr(scanResult.description);
    const severity = this.asStr(scanResult.severity);
    const queryText = `${vulnType} ${description} ${severity}`.trim();

    const matched: UnifiedVuln[] = [];
    let bestScore = 0;

    if (this.vectorStore.count() > 0 && queryText) {
      const queryVector = await this.embed_query(queryText);
      const vecResults = this.vectorStore.search_similar(queryVector, safeLimit, 0.4);
      for (const [meta, score] of vecResults) {
        const vulnId = this.asStr(meta.vuln_id);
        if (!vulnId || !vulnId.toUpperCase().startsWith('CVE-')) continue;
        const vuln = await this.search_by_cve_id(vulnId);
        if (!vuln) continue;
        if (matched.some((item) => item.vuln_id === vuln.vuln_id)) continue;
        matched.push(vuln);
        bestScore = Math.max(bestScore, score);
      }
    }

    const extracted = [
      ...description.match(CVE_PATTERN) ?? [],
      ...vulnType.match(CVE_PATTERN) ?? [],
    ];
    for (const cveId of extracted.slice(0, 3)) {
      const vuln = await this.search_by_cve_id(cveId.toUpperCase());
      if (!vuln) continue;
      if (matched.some((item) => item.vuln_id === vuln.vuln_id)) continue;
      matched.push(vuln);
      bestScore = Math.max(bestScore, 0.95);
    }

    if (matched.length < safeLimit) {
      const online = await this.online_keyword_search(
        vulnType || description,
        safeLimit - matched.length,
      );
      for (const vuln of online) {
        if (matched.some((item) => item.vuln_id === vuln.vuln_id)) continue;
        matched.push(vuln);
      }
    }

    return {
      scan_vuln_type: vulnType,
      scan_description: description,
      matched_vulns: matched.slice(0, safeLimit),
      match_score: bestScore,
    };
  }

  async search_natural_language(query: string, limit = 10): Promise<UnifiedVuln[]> {
    const safeLimit = Math.max(1, limit);
    const normalized = query.trim();
    if (!normalized) return [];

    const result: UnifiedVuln[] = [];
    const seen = new Set<string>();

    if (this.vectorStore.count() > 0) {
      const queryVector = await this.embed_query(normalized);
      const vecMatches = this.vectorStore.search_similar(queryVector, safeLimit, 0.4);
      for (const [meta] of vecMatches) {
        const vulnId = this.asStr(meta.vuln_id);
        if (!vulnId || seen.has(vulnId)) continue;
        const vuln = vulnId.toUpperCase().startsWith('CVE-')
          ? await this.search_by_cve_id(vulnId)
          : null;
        if (!vuln) continue;
        seen.add(vuln.vuln_id);
        result.push(vuln);
      }
    }

    if (result.length < safeLimit) {
      const cves = normalized.match(CVE_PATTERN) ?? [];
      for (const cveId of cves.slice(0, 3)) {
        const vuln = await this.search_by_cve_id(cveId.toUpperCase());
        if (!vuln || seen.has(vuln.vuln_id)) continue;
        seen.add(vuln.vuln_id);
        result.push(vuln);
      }
    }

    if (result.length < safeLimit) {
      const online = await this.online_keyword_search(normalized, safeLimit - result.length);
      for (const vuln of online) {
        if (seen.has(vuln.vuln_id)) continue;
        seen.add(vuln.vuln_id);
        result.push(vuln);
      }
    }

    return result.slice(0, safeLimit);
  }

  async sync_from_sources(
    keywords: string[],
    sources?: string[],
    limitPerSource = 50,
  ): Promise<number> {
    const sourceList = (sources?.length ? sources : ['nvd', 'cve'])
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const safeLimit = Math.max(1, limitPerSource);

    const collected: UnifiedVuln[] = [];
    const seen = new Set<string>();

    for (const sourceName of sourceList) {
      const adapter = this.adapters[sourceName];
      if (!adapter) continue;
      for (const keyword of keywords) {
        const normalizedKeyword = keyword.trim();
        if (!normalizedKeyword) continue;
        try {
          const vulns = await adapter.search(normalizedKeyword, safeLimit);
          for (const vuln of vulns) {
            if (seen.has(vuln.vuln_id)) continue;
            seen.add(vuln.vuln_id);
            collected.push(vuln);
          }
        } catch (error) {
          this.logger.debug(
            `sync failed for ${sourceName}/${normalizedKeyword}: ${(error as Error).message}`,
          );
        }
      }
    }

    if (!collected.length) return 0;
    return this.index_vulns(collected);
  }

  async index_vulns(vulns: UnifiedVuln[]): Promise<number> {
    if (!vulns.length) return 0;
    const texts = vulns.map((item) => item.build_embedding_text());
    const vectors = await this.embed_texts(texts);
    return this.vectorStore.upsert_vulns(vulns, vectors);
  }

  get_stats(): Record<string, unknown> {
    return {
      vector_count: this.vectorStore.count(),
      adapters: Object.keys(this.adapters),
      embedding_model: this.embeddingModel,
    };
  }

  clear_vectors(): void {
    this.vectorStore.clear();
  }

  onModuleDestroy(): void {
    this.vectorStore.close();
  }

  private async online_keyword_search(keyword: string, limit: number): Promise<UnifiedVuln[]> {
    const safeLimit = Math.max(1, limit);
    const results: UnifiedVuln[] = [];
    const seen = new Set<string>();

    for (const sourceName of ['nvd', 'cve']) {
      const adapter = this.adapters[sourceName];
      if (!adapter) continue;
      try {
        const vulns = await adapter.search(keyword, safeLimit);
        for (const vuln of vulns) {
          if (seen.has(vuln.vuln_id)) continue;
          seen.add(vuln.vuln_id);
          results.push(vuln);
        }
      } catch (error) {
        this.logger.debug(
          `keyword search failed for ${sourceName}/${keyword}: ${(error as Error).message}`,
        );
      }
      if (results.length >= safeLimit) break;
    }

    if (results.length) {
      await this.index_vulns(results);
    }
    return results.slice(0, safeLimit);
  }

  private async embed_texts(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const text of texts) {
      vectors.push(await this.embed_query(text));
    }
    return vectors;
  }

  private async embed_query(text: string): Promise<number[]> {
    if (!text.trim()) return this.zeroVector();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.embeddingTimeoutMs);
    try {
      const response = await fetch(`${this.embeddingBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.debug(`Embedding request failed: HTTP ${response.status}`);
        return this.zeroVector();
      }
      const payload = (await response.json()) as { embedding?: number[] };
      const vector = Array.isArray(payload.embedding) ? payload.embedding : [];
      if (!vector.length) return this.zeroVector();
      return this.fitVector(vector);
    } catch (error) {
      this.logger.debug(`Embedding request error: ${(error as Error).message}`);
      return this.zeroVector();
    } finally {
      clearTimeout(timer);
    }
  }

  private fitVector(vector: number[]): number[] {
    if (vector.length === this.dimension) return vector;
    if (vector.length > this.dimension) return vector.slice(0, this.dimension);
    return [...vector, ...new Array(this.dimension - vector.length).fill(0)];
  }

  private zeroVector(): number[] {
    return new Array(this.dimension).fill(0);
  }

  private resolveDimension(): number {
    const raw = process.env.VULN_VECTOR_DIMENSION?.trim();
    if (!raw) return 768;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 768;
    return Math.floor(parsed);
  }

  private asStr(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}

