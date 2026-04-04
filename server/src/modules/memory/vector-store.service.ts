import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VectorItem, VectorSearchResult } from './memory.models';

type VectorRow = {
  id: string;
  content: string;
  vector: Buffer;
  metadata: string;
  created_at: string;
  dimension: number;
};

export class SQLiteVectorStore {
  private readonly db: Database.Database;
  private readonly logger = new Logger(SQLiteVectorStore.name);

  constructor(
    dbPath = 'data/vectors.db',
    private readonly dimension = 768,
  ) {
    const resolved = path.isAbsolute(dbPath)
      ? dbPath
      : path.resolve(process.cwd(), dbPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_items (
        id TEXT PRIMARY KEY,
        collection TEXT NOT NULL DEFAULT 'default',
        content TEXT NOT NULL DEFAULT '',
        vector BLOB NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        dimension INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_vector_items_collection
        ON vector_items(collection);

      CREATE TABLE IF NOT EXISTS collections (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        config TEXT NOT NULL DEFAULT '{}'
      );
    `);
  }

  add(items: VectorItem[], collection = 'default'): void {
    if (!items.length) return;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO collections (name, description, config)
         VALUES (?, ?, '{}')`,
      )
      .run(collection, `Collection: ${collection}`);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vector_items
      (id, collection, content, vector, metadata, created_at, dimension)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((payload: VectorItem[]) => {
      for (const item of payload) {
        if (item.vector.length !== this.dimension) {
          throw new Error(
            `Vector dimension mismatch: expected ${this.dimension}, got ${item.vector.length}`,
          );
        }
        stmt.run(
          item.id,
          collection,
          item.content,
          this.vectorToBlob(item.vector),
          JSON.stringify(item.metadata ?? {}),
          item.created_at || new Date().toISOString(),
          item.vector.length,
        );
      }
    });

    tx(items);
  }

  search(
    queryVector: number[],
    limit = 10,
    collection = 'default',
    threshold = 0.7,
  ): VectorSearchResult[] {
    if (!queryVector.length) return [];
    if (queryVector.length !== this.dimension) return [];

    const rows = this.db
      .prepare(
        `SELECT id, content, vector, metadata, created_at, dimension
         FROM vector_items WHERE collection = ?`,
      )
      .all(collection) as VectorRow[];

    const results: VectorSearchResult[] = [];
    for (const row of rows) {
      if (row.dimension !== queryVector.length) continue;
      const storedVector = this.blobToVector(row.vector);
      if (storedVector.length !== queryVector.length) continue;
      const similarity = this.cosineSimilarity(queryVector, storedVector);
      if (similarity < threshold) continue;
      results.push({
        item: {
          id: row.id,
          content: row.content,
          vector: storedVector,
          metadata: this.safeParseMetadata(row.metadata),
          created_at: row.created_at,
        },
        similarity,
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, Math.max(0, limit));
  }

  get(itemId: string): VectorItem | null {
    const row = this.db
      .prepare(
        `SELECT id, content, vector, metadata, created_at
         FROM vector_items WHERE id = ?`,
      )
      .get(itemId) as Omit<VectorRow, 'dimension'> | undefined;
    if (!row) return null;
    return {
      id: row.id,
      content: row.content,
      vector: this.blobToVector(row.vector),
      metadata: this.safeParseMetadata(row.metadata),
      created_at: row.created_at,
    };
  }

  delete(itemId: string): boolean {
    const info = this.db
      .prepare('DELETE FROM vector_items WHERE id = ?')
      .run(itemId);
    return info.changes > 0;
  }

  clear(collection = 'default'): void {
    this.db.prepare('DELETE FROM vector_items WHERE collection = ?').run(collection);
  }

  count(collection?: string): number {
    if (collection) {
      const row = this.db
        .prepare('SELECT COUNT(*) as c FROM vector_items WHERE collection = ?')
        .get(collection) as { c: number };
      return row.c;
    }
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM vector_items')
      .get() as { c: number };
    return row.c;
  }

  listCollections(): string[] {
    const rows = this.db
      .prepare('SELECT name FROM collections ORDER BY name ASC')
      .all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  close(): void {
    this.db.close();
  }

  private vectorToBlob(vector: number[]): Buffer {
    const typed = Float32Array.from(vector);
    return Buffer.from(typed.buffer);
  }

  private blobToVector(blob: Buffer): number[] {
    const aligned = blob.buffer.slice(
      blob.byteOffset,
      blob.byteOffset + blob.byteLength,
    );
    const typed = new Float32Array(aligned);
    return Array.from(typed);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom <= 1e-8) return 0;
    return dot / denom;
  }

  private safeParseMetadata(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch (error) {
      this.logger.debug(`Failed to parse metadata: ${(error as Error).message}`);
      return {};
    }
  }
}

@Injectable()
export class VectorStoreManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(VectorStoreManagerService.name);
  private readonly stores = new Map<string, SQLiteVectorStore>();
  private readonly dbPath: string;

  constructor(private readonly config: ConfigService) {
    this.dbPath =
      this.config.get<string>('app.vectorStorePath') ??
      process.env.VECTOR_STORE_PATH?.trim() ??
      'data/vectors.db';
  }

  getStore(collection = 'default', dimension = 768): SQLiteVectorStore {
    const key = `${collection}:${dimension}`;
    const existing = this.stores.get(key);
    if (existing) return existing;

    const created = new SQLiteVectorStore(this.dbPath, dimension);
    this.stores.set(key, created);
    return created;
  }

  async add_memory(
    content: string,
    vector: number[],
    memoryType = 'short_term',
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    const store = this.getStore(memoryType, vector.length);
    const itemId = `${memoryType}:${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    store.add(
      [
        {
          id: itemId,
          content,
          vector,
          metadata,
          created_at: new Date().toISOString(),
        },
      ],
      memoryType,
    );
    return itemId;
  }

  async search_memories(
    queryVector: number[],
    memoryType?: string,
    limit = 10,
  ): Promise<VectorSearchResult[]> {
    if (!queryVector.length) return [];
    const targetLimit = Math.max(1, limit);

    if (memoryType) {
      const store = this.getStore(memoryType, queryVector.length);
      return store.search(queryVector, targetLimit, memoryType);
    }

    const merged: VectorSearchResult[] = [];
    for (const [key, store] of this.stores.entries()) {
      const collection = key.split(':')[0];
      const results = store.search(queryVector, targetLimit, collection);
      merged.push(...results);
    }
    merged.sort((a, b) => b.similarity - a.similarity);
    return merged.slice(0, targetLimit);
  }

  get_stats(): Record<string, unknown> {
    let total = 0;
    const collections: Record<string, number> = {};

    for (const [key, store] of this.stores.entries()) {
      const [collection] = key.split(':');
      const count = store.count(collection);
      collections[key] = count;
      total += count;
    }

    return {
      total,
      collections,
    };
  }

  onModuleDestroy(): void {
    for (const [key, store] of this.stores.entries()) {
      try {
        store.close();
      } catch (error) {
        this.logger.warn(`Failed to close vector store ${key}: ${(error as Error).message}`);
      }
    }
    this.stores.clear();
  }
}

