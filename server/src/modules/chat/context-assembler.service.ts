import { Injectable, Logger } from '@nestjs/common';
import { MemoryService } from '../memory/memory.service';
import { DatabaseService } from '../database/database.service';
import { Session } from '../../common/types';

const VECTOR_DIMENSION = 128;

interface ContextDebugMeta {
  sessionMessages: number;
  sqliteTurns: number;
  vectorHits: number;
}

interface AssembledContext {
  contextBlock: string;
  debug: ContextDebugMeta;
}

@Injectable()
export class ContextAssemblerService {
  private readonly logger = new Logger(ContextAssemblerService.name);

  constructor(
    private readonly memoryService: MemoryService,
    private readonly databaseService: DatabaseService,
  ) {}

  async build(params: {
    query: string;
    session: Session;
    sessionId: string;
    agentType: string;
  }): Promise<AssembledContext> {
    const { query, session, sessionId, agentType } = params;
    const recentSession = session.messages.slice(-24).map((m) => `${m.role}: ${m.content}`);
    const sqliteHistory = this.databaseService.getConversations({ sessionId, limit: 8 });

    const queryVector = this.textToVector(query);
    const vectorResults = await this.memoryService.search_vector_memories(
      queryVector,
      'episodic',
      6,
    );

    const dedupe = new Set<string>();
    const sqliteLines: string[] = [];
    for (const turn of sqliteHistory.reverse()) {
      const pair = `用户: ${turn.userMessage}\n助手: ${turn.assistantMessage}`;
      if (dedupe.has(pair)) continue;
      dedupe.add(pair);
      sqliteLines.push(pair);
    }

    const vectorLines: string[] = [];
    for (const hit of vectorResults) {
      const content = hit.item.content.trim();
      if (!content || dedupe.has(content)) continue;
      dedupe.add(content);
      vectorLines.push(
        `${content}\n来源: ${String(hit.item.metadata.sessionId ?? 'unknown')} / 相似度: ${hit.similarity.toFixed(3)}`,
      );
    }

    const contextParts: string[] = [];
    if (recentSession.length > 0) {
      contextParts.push(`【RecentSession】\n${recentSession.join('\n')}`);
    }
    if (sqliteLines.length > 0) {
      contextParts.push(`【SQLiteHistory】\n${sqliteLines.join('\n\n')}`);
    }
    if (vectorLines.length > 0) {
      contextParts.push(`【VectorMemory】\n${vectorLines.join('\n\n')}`);
    }
    contextParts.push(`【RequestMeta】\nsession_id: ${sessionId}\nagent: ${agentType}`);

    return {
      contextBlock: contextParts.join('\n\n'),
      debug: {
        sessionMessages: recentSession.length,
        sqliteTurns: sqliteLines.length,
        vectorHits: vectorLines.length,
      },
    };
  }

  async rememberTurn(params: {
    sessionId: string;
    agentType: string;
    userMessage: string;
    assistantMessage: string;
  }): Promise<void> {
    const { sessionId, agentType, userMessage, assistantMessage } = params;
    const merged = `用户: ${userMessage}\n助手: ${assistantMessage}`;
    try {
      await this.memoryService.remember(merged, 'short_term', 0.6, { sessionId, agentType });
      await this.memoryService.remember(merged, 'episodic', 0.75, { sessionId, agentType });
      await this.memoryService.add_vector_memory(
        merged,
        this.textToVector(merged),
        'episodic',
        { sessionId, agentType, createdAt: new Date().toISOString() },
      );
    } catch (error) {
      this.logger.warn(`rememberTurn failed: ${(error as Error).message}`);
    }
  }

  private textToVector(text: string): number[] {
    const vector = Array.from({ length: VECTOR_DIMENSION }, () => 0);
    const normalized = text.normalize('NFKC').toLowerCase();
    if (!normalized) return vector;
    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      const index = (code + i * 31) % VECTOR_DIMENSION;
      vector[index] += 1 + (code % 7) * 0.05;
    }
    let norm = 0;
    for (const value of vector) norm += value * value;
    norm = Math.sqrt(norm);
    if (norm <= 1e-8) return vector;
    return vector.map((value) => value / norm);
  }
}
