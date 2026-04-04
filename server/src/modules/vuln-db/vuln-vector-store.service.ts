import { Logger } from '@nestjs/common';
import { SQLiteVectorStore } from '../memory/vector-store.service';
import { UnifiedVuln } from './schema';
import { VectorItem } from '../memory/memory.models';

export class VulnVectorStore {
  static readonly COLLECTION = 'vuln_db';
  private readonly logger = new Logger(VulnVectorStore.name);
  private readonly store: SQLiteVectorStore;

  constructor(
    dbPath = 'data/vuln_vectors.db',
    private readonly dimension = 768,
  ) {
    this.store = new SQLiteVectorStore(dbPath, dimension);
  }

  upsert_vulns(vulns: UnifiedVuln[], embeddings: number[][]): number {
    if (vulns.length !== embeddings.length) {
      throw new Error(`vulns count ${vulns.length} does not match embeddings count ${embeddings.length}`);
    }

    const items: VectorItem[] = [];
    for (let i = 0; i < vulns.length; i++) {
      const vuln = vulns[i];
      const vector = embeddings[i];
      items.push({
        id: vuln.vuln_id,
        content: vuln.build_embedding_text(),
        vector,
        metadata: {
          vuln_id: vuln.vuln_id,
          source: vuln.source,
          severity: vuln.severity,
          cvss_score: vuln.cvss_score,
          title: vuln.title,
          description: vuln.description.slice(0, 500),
          tags: vuln.tags.slice(0, 10),
        },
        created_at: new Date().toISOString(),
      });
    }

    this.store.add(items, VulnVectorStore.COLLECTION);
    this.logger.debug(`Upserted ${items.length} vulnerability vectors`);
    return items.length;
  }

  search_similar(
    queryVector: number[],
    limit = 10,
    threshold = 0.5,
  ): Array<[Record<string, unknown>, number]> {
    const raw = this.store.search(
      queryVector,
      limit,
      VulnVectorStore.COLLECTION,
      threshold,
    );

    return raw.map(({ item, similarity }) => {
      const metadata: Record<string, unknown> = {
        ...(item.metadata ?? {}),
        _content: item.content,
        _id: item.id,
      };
      return [metadata, similarity];
    });
  }

  count(): number {
    return this.store.count(VulnVectorStore.COLLECTION);
  }

  clear(): void {
    this.store.clear(VulnVectorStore.COLLECTION);
  }

  close(): void {
    this.store.close();
  }

  get_dimension(): number {
    return this.dimension;
  }
}

