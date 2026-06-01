import { Injectable, Logger } from '@nestjs/common';
import { MemoryService } from '../memory/memory.service';
import { DatabaseService } from '../database/database.service';
import { ContextItem, ContextPatch, Session, SessionContextState } from '../../common/types';
import { ContextStoreService } from './context-store.service';
import {
  ModelWindow,
  approxTokens,
  computePromptBudget,
  getModelWindow,
} from './model-context-window';

const VECTOR_DIMENSION = 128;

/**
 * 上下文管理器（保留 ContextAssemblerService 名称便于兼容现有 import）：
 * - build()：根据当前模型上下文预算 + focus 加权 + pinned 优先级，
 *   组装实际写入 prompt 的 contextBlock；
 * - applyPatch()：把 ExploreAgent 等产出的事实写入会话上下文池；
 * - extractFocusKeywords()：轻量关键词抽取，用于实时更新 focus；
 * - rememberTurn()：与旧实现兼容，写入 short_term / episodic / vector。
 */
interface ContextDebugMeta {
  sessionMessages: number;
  sqliteTurns: number;
  vectorHits: number;
  pinned: number;
  focus: string[];
  promptBudget: number;
  usedTokens: number;
  droppedSections: string[];
  modelName?: string;
  /** 当前模型的上下文窗口（input + output 总和） */
  contextWindow: number;
  /** 该模型保留给 system / 输出的预算 */
  reservedTokens: number;
}

export interface AssembledContext {
  contextBlock: string;
  debug: ContextDebugMeta;
}

interface BuildArgs {
  query: string;
  session: Session;
  sessionId: string;
  agentType: string;
  modelName?: string;
}

@Injectable()
export class ContextAssemblerService {
  private readonly logger = new Logger(ContextAssemblerService.name);

  constructor(
    private readonly memoryService: MemoryService,
    private readonly databaseService: DatabaseService,
    private readonly contextStore: ContextStoreService,
  ) {}

  /** 把 ExploreAgent 产出的 patch 写入对应 session 的上下文池 */
  applyPatch(sessionId: string, patch: ContextPatch): void {
    this.contextStore.applyPatch(sessionId, patch);
  }

  /** 实时更新 focus：用一个轻量规则从用户输入抽取实体/关键词 */
  updateFocusFromInput(sessionId: string, userInput: string): string[] {
    const keywords = this.extractFocusKeywords(userInput);
    if (keywords.length > 0) {
      this.contextStore.updateFocus(sessionId, keywords, 1.0);
    } else {
      /** 没有新关键词也走一次衰减，保持 focus 时效 */
      this.contextStore.updateFocus(sessionId, [], 0);
    }
    return keywords;
  }

  getStoreSnapshot(sessionId: string): SessionContextState {
    return this.contextStore.get(sessionId);
  }

  async build(params: BuildArgs): Promise<AssembledContext> {
    const { query, session, sessionId, agentType, modelName } = params;
    this.contextStore.setModelName(sessionId, modelName);
    const state = this.contextStore.get(sessionId);
    const window = getModelWindow(modelName);
    const budget = computePromptBudget(window);

    const candidates: ContextItem[] = [];

    // 1) pinned：ExploreAgent 写入 / 用户 pin，最高优先级
    for (const item of state.pinned) {
      candidates.push(item);
    }

    // 2) recent session：最近若干轮
    const recentSession = session.messages.slice(-24);
    for (let i = 0; i < recentSession.length; i++) {
      const m = recentSession[i];
      const content = `${m.role}: ${m.content}`;
      candidates.push({
        id: `recent-${i}-${m.timestamp.getTime()}`,
        content,
        source: 'recent',
        /** 越靠近现在，优先级越高 */
        priority: 0.5 + (i / Math.max(1, recentSession.length - 1)) * 0.3,
        tokensEstimate: approxTokens(content),
        tags: [m.role],
        ttl: 'session',
        createdAt: m.timestamp,
      });
    }

    // 3) SQLite 历史回合
    const sqliteHistory = this.databaseService.getConversations({ sessionId, limit: 8 });
    sqliteHistory.reverse().forEach((turn, idx) => {
      const content = `用户: ${turn.userMessage}\n助手: ${turn.assistantMessage}`;
      candidates.push({
        id: `sqlite-${idx}`,
        content,
        source: 'sqlite',
        priority: 0.45,
        tokensEstimate: approxTokens(content),
        tags: ['history'],
        ttl: 'session',
        createdAt: new Date(),
      });
    });

    // 4) Vector：focus 加权检索；query 与 focus 关键词组合检索后归并
    const focusKeywords = state.focus.map((f) => f.keyword);
    const vectorQueryText =
      focusKeywords.length > 0 ? `${query} ${focusKeywords.join(' ')}` : query;
    const queryVector = this.textToVector(vectorQueryText);
    let vectorHits = 0;
    try {
      const vectorResults = await this.memoryService.search_vector_memories(
        queryVector,
        'episodic',
        8,
      );
      for (const hit of vectorResults) {
        const content = hit.item.content.trim();
        if (!content) continue;
        const focusBoost = this.computeFocusBoost(content, focusKeywords);
        candidates.push({
          id: `vec-${hit.item.id ?? `${vectorHits}`}`,
          content: `${content}\n来源: ${String(hit.item.metadata?.sessionId ?? 'unknown')} / 相似度: ${hit.similarity.toFixed(3)}`,
          source: 'vector',
          priority: Math.min(0.85, 0.35 + hit.similarity * 0.4 + focusBoost),
          tokensEstimate: approxTokens(content),
          tags: ['vector'],
          ttl: 'turn',
          createdAt: new Date(),
        });
        vectorHits++;
      }
    } catch (error) {
      this.logger.warn(`vector search failed: ${(error as Error).message}`);
    }

    // 5) 去重 + 按预算切片
    const { selected, dropped, usedTokens } = packByBudget(candidates, budget);

    const sections = renderSections(selected);
    const block = sections.length > 0 ? sections.join('\n\n') : '';
    const contextBlock = appendMeta(block, {
      sessionId,
      agentType,
      modelName: modelName ?? state.modelName,
      window,
      promptBudget: budget,
      usedTokens,
      focus: focusKeywords,
      unresolved: state.unresolved,
    });

    return {
      contextBlock,
      debug: {
        sessionMessages: recentSession.length,
        sqliteTurns: sqliteHistory.length,
        vectorHits,
        pinned: state.pinned.length,
        focus: focusKeywords,
        promptBudget: budget,
        usedTokens,
        droppedSections: dropped.map((d) => d.source),
        modelName: modelName ?? state.modelName,
        contextWindow: window.context,
        reservedTokens: window.reserveForOutput + window.reserveForSystem,
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
      await this.memoryService.add_vector_memory(merged, this.textToVector(merged), 'episodic', {
        sessionId,
        agentType,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(`rememberTurn failed: ${(error as Error).message}`);
    }
    /** 每轮结束做 turn 级清理 */
    this.contextStore.endTurn(sessionId);
  }

  /**
   * 简易关键词抽取：
   * - 截取 IP / 域名 / URL / CVE 编号 / 端口 / 协议词
   * - 不依赖外部 NER，作为 LLM focus 的轻量兜底
   * IntentRouter 也会返回 focus，与这里取并集
   */
  extractFocusKeywords(text: string): string[] {
    if (!text) return [];
    const matches = new Set<string>();
    const patterns: RegExp[] = [
      /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
      /\bcve-\d{4}-\d{4,7}\b/gi,
      /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b/gi,
      /https?:\/\/[^\s)>"']+/gi,
      /\bport\s*\d{1,5}\b/gi,
      /\b(?:http|https|ftp|ssh|smb|smtp|imap|pop3|ldap|rdp|mysql|redis|mongo|mssql|postgres)\b/gi,
    ];
    for (const re of patterns) {
      const found = text.match(re);
      if (found) for (const f of found) matches.add(f.toLowerCase());
    }
    return [...matches].slice(0, 12);
  }

  // ------ internals ------

  private computeFocusBoost(content: string, focusKeywords: string[]): number {
    if (focusKeywords.length === 0) return 0;
    const lower = content.toLowerCase();
    let hits = 0;
    for (const kw of focusKeywords) {
      if (kw && lower.includes(kw)) hits++;
    }
    return Math.min(0.2, hits * 0.05);
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

// ---------- helpers ----------

interface PackResult {
  selected: ContextItem[];
  dropped: ContextItem[];
  usedTokens: number;
}

function packByBudget(candidates: ContextItem[], budget: number): PackResult {
  const dedupe = new Map<string, ContextItem>();
  for (const item of candidates) {
    const key = item.content.trim();
    if (!key) continue;
    const existing = dedupe.get(key);
    if (!existing || existing.priority < item.priority) {
      dedupe.set(key, item);
    }
  }
  const unique = [...dedupe.values()].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const selected: ContextItem[] = [];
  const dropped: ContextItem[] = [];
  let used = 0;
  for (const item of unique) {
    if (used + item.tokensEstimate > budget) {
      dropped.push(item);
      continue;
    }
    selected.push(item);
    used += item.tokensEstimate;
  }
  return { selected, dropped, usedTokens: used };
}

function renderSections(items: ContextItem[]): string[] {
  const groups: Record<string, string[]> = {
    Pinned: [],
    RecentSession: [],
    SQLiteHistory: [],
    VectorMemory: [],
  };
  for (const item of items) {
    if (item.source === 'explore' || item.source === 'user_pinned') {
      groups.Pinned.push(item.content);
    } else if (item.source === 'recent') {
      groups.RecentSession.push(item.content);
    } else if (item.source === 'sqlite') {
      groups.SQLiteHistory.push(item.content);
    } else {
      groups.VectorMemory.push(item.content);
    }
  }
  const sections: string[] = [];
  for (const name of ['Pinned', 'RecentSession', 'SQLiteHistory', 'VectorMemory']) {
    const block = groups[name];
    if (block.length > 0) {
      sections.push(`【${name}】\n${block.join('\n\n')}`);
    }
  }
  return sections;
}

interface MetaArgs {
  sessionId: string;
  agentType: string;
  modelName?: string;
  window: ModelWindow;
  promptBudget: number;
  usedTokens: number;
  focus: string[];
  unresolved: string[];
}

function appendMeta(block: string, meta: MetaArgs): string {
  const focusLine = meta.focus.length > 0 ? meta.focus.join(', ') : '(无)';
  const unresolvedLine = meta.unresolved.length > 0 ? meta.unresolved.join('; ') : '(无)';
  const lines = [
    `session_id: ${meta.sessionId}`,
    `agent: ${meta.agentType}`,
    `model: ${meta.modelName ?? '(default)'}`,
    `context_window: ${meta.window.context}`,
    `prompt_budget: ${meta.promptBudget}`,
    `used_tokens(approx): ${meta.usedTokens}`,
    `focus: ${focusLine}`,
    `unresolved: ${unresolvedLine}`,
  ];
  const requestMeta = `【RequestMeta】\n${lines.join('\n')}`;
  return block ? `${block}\n\n${requestMeta}` : requestMeta;
}
