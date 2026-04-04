import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MemoryItem,
  MemoryStats,
  MemoryType,
  clampImportance,
  createMemoryItem,
  toMemoryType,
} from './memory.models';
import { VectorSearchResult } from './memory.models';
import { VectorStoreManagerService } from './vector-store.service';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly shortTermMaxTurns: number;
  private readonly episodicStoragePath: string;
  private readonly longTermStoragePath: string;

  private shortTermBuffer: MemoryItem[] = [];
  private episodicMemories: MemoryItem[] = [];
  private longTermMemories: MemoryItem[] = [];

  constructor(private readonly vectorStore: VectorStoreManagerService) {
    this.shortTermMaxTurns = this.resolveShortTermMaxTurns();
    this.episodicStoragePath = this.resolveFilePath(
      process.env.EPISODIC_MEMORY_PATH,
      'data/episodic_memory.json',
    );
    this.longTermStoragePath = this.resolveFilePath(
      process.env.LONG_TERM_MEMORY_PATH,
      'data/long_term_memory.json',
    );
    this.loadPersistentMemories();
  }

  async remember(
    content: string,
    memoryType: string = 'short_term',
    importance = 0.5,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const resolvedType = toMemoryType(memoryType) ?? 'short_term';
    const item = createMemoryItem({
      content,
      type: resolvedType,
      importance,
      metadata,
    });

    if (resolvedType === 'short_term') {
      await this.addShortTerm(item);
      return;
    }
    if (resolvedType === 'episodic') {
      await this.addEpisodic(item);
      return;
    }
    await this.addLongTerm(item);
  }

  async recall(
    query = '',
    memoryType?: string | null,
    limit = 5,
  ): Promise<MemoryItem[]> {
    const targetLimit = Math.max(1, limit);
    const resolvedType = toMemoryType(memoryType ?? undefined);

    if (resolvedType === 'short_term') {
      return this.searchShortTerm(query, targetLimit);
    }
    if (resolvedType === 'episodic') {
      return this.searchEpisodic(query, targetLimit);
    }
    if (resolvedType === 'long_term') {
      return this.searchLongTerm(query, targetLimit);
    }

    const shortMemories = this.searchShortTerm(query, targetLimit);
    const episodicMemories = this.searchEpisodic(query, targetLimit);
    const longTermMemories = this.searchLongTerm(query, targetLimit);
    return [...shortMemories, ...episodicMemories, ...longTermMemories];
  }

  async get_context_for_agent(query = ''): Promise<string> {
    const memories = await this.recall(query, null, 10);
    if (!memories.length) return '';

    const lines: string[] = ['=== Agent Memory Context ==='];

    const shortMemories = memories.filter((item) => item.type === 'short_term');
    if (shortMemories.length) {
      lines.push('', '[Recent Context]');
      for (const item of shortMemories.slice(-5)) {
        lines.push(`- ${item.content}`);
      }
    }

    const episodic = memories.filter((item) => item.type === 'episodic');
    if (episodic.length) {
      lines.push('', '[Past Experiences]');
      for (const item of episodic.slice(-3)) {
        lines.push(`- ${item.content}`);
      }
    }

    const longTerm = memories.filter((item) => item.type === 'long_term');
    if (longTerm.length) {
      lines.push('', '[Knowledge]');
      for (const item of longTerm.slice(-3)) {
        lines.push(`- ${item.content}`);
      }
    }

    return lines.join('\n');
  }

  async distill_from_conversation(
    conversation: Array<Record<string, unknown>>,
    summary: string,
  ): Promise<void> {
    const item = createMemoryItem({
      content: summary,
      type: 'episodic',
      importance: 0.6,
      metadata: {
        conversation_length: conversation.length,
      },
    });
    await this.addEpisodic(item);
  }

  async add_episode(
    event: string,
    outcome: string,
    target = '',
  ): Promise<void> {
    const item = createMemoryItem({
      content: event,
      type: 'episodic',
      importance: 0.7,
      metadata: { outcome, target },
    });
    await this.addEpisodic(item);
  }

  async add_knowledge(
    fact: string,
    category = 'general',
    importance = 0.5,
  ): Promise<void> {
    const item = createMemoryItem({
      content: fact,
      type: 'long_term',
      importance,
      metadata: { category },
    });
    await this.addLongTerm(item);
  }

  get_recent_short_term(limit?: number): MemoryItem[] {
    if (!limit || limit <= 0) return [...this.shortTermBuffer];
    return this.shortTermBuffer.slice(-limit);
  }

  list_memories(memoryType?: string | null, limit?: number): MemoryItem[] {
    const resolvedType = toMemoryType(memoryType ?? undefined);
    const targetLimit = limit && limit > 0 ? limit : null;

    if (resolvedType === 'short_term') {
      const values = [...this.shortTermBuffer];
      return targetLimit ? values.slice(-targetLimit) : values;
    }
    if (resolvedType === 'episodic') {
      const values = [...this.episodicMemories];
      return targetLimit ? values.slice(-targetLimit) : values;
    }
    if (resolvedType === 'long_term') {
      const values = [...this.longTermMemories];
      return targetLimit ? values.slice(-targetLimit) : values;
    }

    const merged = [
      ...this.shortTermBuffer,
      ...this.episodicMemories,
      ...this.longTermMemories,
    ];
    return targetLimit ? merged.slice(-targetLimit) : merged;
  }

  async clear(memoryType?: string | null): Promise<void> {
    const resolvedType = toMemoryType(memoryType ?? undefined);
    if (!resolvedType) {
      await this.clear_all();
      return;
    }
    if (resolvedType === 'short_term') {
      this.shortTermBuffer = [];
      return;
    }
    if (resolvedType === 'episodic') {
      this.episodicMemories = [];
      this.saveStore(this.episodicStoragePath, this.episodicMemories);
      return;
    }
    this.longTermMemories = [];
    this.saveStore(this.longTermStoragePath, this.longTermMemories);
  }

  async clear_all(): Promise<void> {
    this.shortTermBuffer = [];
    this.episodicMemories = [];
    this.longTermMemories = [];
    this.saveStore(this.episodicStoragePath, this.episodicMemories);
    this.saveStore(this.longTermStoragePath, this.longTermMemories);
    this.logger.log('All memories have been cleared');
  }

  get_stats(): MemoryStats {
    return {
      short_term_count: this.shortTermBuffer.length,
      episodic_count: this.episodicMemories.length,
      long_term_count: this.longTermMemories.length,
    };
  }

  async add_vector_memory(
    content: string,
    vector: number[],
    memoryType = 'short_term',
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    return this.vectorStore.add_memory(content, vector, memoryType, metadata);
  }

  async search_vector_memories(
    queryVector: number[],
    memoryType?: string,
    limit = 10,
  ): Promise<VectorSearchResult[]> {
    return this.vectorStore.search_memories(queryVector, memoryType, limit);
  }

  get_vector_stats(): Record<string, unknown> {
    return this.vectorStore.get_stats();
  }

  private async addShortTerm(item: MemoryItem): Promise<void> {
    this.shortTermBuffer.push(item);
    if (this.shortTermBuffer.length > this.shortTermMaxTurns) {
      this.shortTermBuffer = this.shortTermBuffer.slice(-this.shortTermMaxTurns);
    }
  }

  private async addEpisodic(item: MemoryItem): Promise<void> {
    this.episodicMemories.push(item);
    this.saveStore(this.episodicStoragePath, this.episodicMemories);
  }

  private async addLongTerm(item: MemoryItem): Promise<void> {
    this.longTermMemories.push(item);
    this.saveStore(this.longTermStoragePath, this.longTermMemories);
  }

  private searchShortTerm(query: string, limit: number): MemoryItem[] {
    return this.filterByQuery(this.shortTermBuffer, query).slice(0, limit);
  }

  private searchEpisodic(query: string, limit: number): MemoryItem[] {
    const matched = this.filterByQuery(this.episodicMemories, query);
    return matched.slice(-limit);
  }

  private searchLongTerm(query: string, limit: number): MemoryItem[] {
    const matched = this.filterByQuery(this.longTermMemories, query);
    return matched.slice(-limit);
  }

  private filterByQuery(items: MemoryItem[], query: string): MemoryItem[] {
    const keyword = query.toLowerCase();
    return items.filter((item) => item.content.toLowerCase().includes(keyword));
  }

  private loadPersistentMemories(): void {
    this.episodicMemories = this.loadStore(this.episodicStoragePath, 'episodic');
    this.longTermMemories = this.loadStore(this.longTermStoragePath, 'long_term');
  }

  private loadStore(storagePath: string, defaultType: MemoryType): MemoryItem[] {
    try {
      if (!fs.existsSync(storagePath)) return [];
      const raw = fs.readFileSync(storagePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const normalized: MemoryItem[] = [];
      for (const item of parsed) {
        const candidate = this.normalizeMemoryItem(item, defaultType);
        if (candidate) normalized.push(candidate);
      }
      return normalized;
    } catch (error) {
      this.logger.warn(
        `Failed to load memory store ${storagePath}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  private saveStore(storagePath: string, items: MemoryItem[]): void {
    try {
      const dir = path.dirname(storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(storagePath, JSON.stringify(items, null, 2), 'utf8');
    } catch (error) {
      this.logger.error(
        `Failed to save memory store ${storagePath}: ${(error as Error).message}`,
      );
    }
  }

  private normalizeMemoryItem(
    value: unknown,
    defaultType: MemoryType,
  ): MemoryItem | null {
    if (!value || typeof value !== 'object') return null;
    const obj = value as Record<string, unknown>;

    const content = typeof obj.content === 'string' ? obj.content : '';
    if (!content) return null;

    const type = toMemoryType(
      typeof obj.type === 'string' ? obj.type : defaultType,
    ) ?? defaultType;

    const importanceRaw =
      typeof obj.importance === 'number' ? obj.importance : 0.5;
    const importance = clampImportance(importanceRaw);

    const id = typeof obj.id === 'string' && obj.id ? obj.id : `mem-${Date.now()}`;
    const createdAt =
      typeof obj.created_at === 'string' && obj.created_at
        ? obj.created_at
        : new Date().toISOString();
    const metadata =
      obj.metadata && typeof obj.metadata === 'object'
        ? (obj.metadata as Record<string, unknown>)
        : {};

    return {
      id,
      content,
      type,
      importance,
      created_at: createdAt,
      metadata,
    };
  }

  private resolveShortTermMaxTurns(): number {
    const raw = process.env.SHORT_TERM_MEMORY_MAX_TURNS;
    if (!raw) return 10;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 10;
    return Math.floor(parsed);
  }

  private resolveFilePath(candidate: string | undefined, fallback: string): string {
    const source = (candidate ?? '').trim() || fallback;
    return path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
  }
}

