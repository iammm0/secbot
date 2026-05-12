import { Injectable } from '@nestjs/common';
import {
  ContextItem,
  ContextPatch,
  ContextPatchFact,
  ContextTtl,
  FocusEntry,
  SessionContextState,
} from '../../common/types';
import { approxTokens } from './model-context-window';

/** focus 权重每轮衰减系数（旧关注点逐步淡出） */
const FOCUS_DECAY = 0.85;
/** 单条 focus 权重低于该阈值时丢弃 */
const FOCUS_MIN_WEIGHT = 0.05;
/** 同时保留的 focus 上限 */
const FOCUS_MAX_ITEMS = 12;
/** pinned 上下文项上限（避免无界增长） */
const PINNED_MAX_ITEMS = 32;

/**
 * 按 sessionId 保存「上下文池」状态。
 *
 * 这是一个内存级 store；如果未来要持久化，可以把 stores 换成 better-sqlite3 表
 * 或与 MemoryModule 合并，但当前 chat.service 的 sessions 本身也只是内存级，保持一致。
 */
@Injectable()
export class ContextStoreService {
  private readonly stores = new Map<string, SessionContextState>();

  get(sessionId: string): SessionContextState {
    let state = this.stores.get(sessionId);
    if (!state) {
      state = this.createEmpty();
      this.stores.set(sessionId, state);
    }
    return state;
  }

  setModelName(sessionId: string, modelName?: string): void {
    if (!modelName) return;
    const state = this.get(sessionId);
    state.modelName = modelName;
  }

  /** 写入 ExploreAgent 或上游产出的 patch；同 key 覆盖、自动估算 token */
  applyPatch(sessionId: string, patch: ContextPatch): void {
    const state = this.get(sessionId);
    const now = new Date();

    for (const fact of patch.facts ?? []) {
      this.upsertFact(state, fact, now);
    }

    if (patch.pinned?.length) {
      for (const raw of patch.pinned) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        this.upsertFact(
          state,
          { key: `pin-${this.hashShort(trimmed)}`, value: trimmed, priority: 0.95, ttl: 'session' },
          now,
        );
      }
    }

    if (patch.unresolved?.length) {
      const merged = new Set([...state.unresolved, ...patch.unresolved.map((s) => s.trim())]);
      state.unresolved = [...merged].filter(Boolean).slice(0, 16);
    }

    if (patch.suggestedFocus?.length) {
      this.bumpFocus(state, patch.suggestedFocus, 1.0);
    }

    this.prunePinned(state);
  }

  /** 用户/系统手动 pin 一段文本（如 IDE 选区） */
  pinText(sessionId: string, content: string, ttl: ContextTtl = 'session', priority = 0.9): void {
    const trimmed = content.trim();
    if (!trimmed) return;
    const state = this.get(sessionId);
    this.upsertFact(
      state,
      { key: `user-${this.hashShort(trimmed)}`, value: trimmed, priority, ttl, tags: ['user'] },
      new Date(),
    );
    this.prunePinned(state);
  }

  removePinnedById(sessionId: string, id: string): boolean {
    const state = this.get(sessionId);
    const before = state.pinned.length;
    state.pinned = state.pinned.filter((p) => p.id !== id);
    return state.pinned.length !== before;
  }

  /**
   * 调用方在每轮路由/拼装上下文时调用，更新 focus 列表：
   * 1) 旧 focus 衰减
   * 2) 命中的关键词 +1
   * 3) 超过阈值的丢弃
   */
  updateFocus(sessionId: string, keywords: string[], boost = 1.0): void {
    const state = this.get(sessionId);
    for (const entry of state.focus) {
      entry.weight *= FOCUS_DECAY;
    }
    this.bumpFocus(state, keywords, boost);
  }

  /** turn 级清理：每轮结束时把 ttl=turn 的项移除 */
  endTurn(sessionId: string): void {
    const state = this.stores.get(sessionId);
    if (!state) return;
    state.pinned = state.pinned.filter((p) => p.ttl !== 'turn');
    state.focus = state.focus.filter((f) => f.weight >= FOCUS_MIN_WEIGHT);
  }

  /** 完全清空（用于 /clear 或切会话） */
  reset(sessionId: string): void {
    this.stores.set(sessionId, this.createEmpty());
  }

  // ------ internals ------

  private createEmpty(): SessionContextState {
    return { pinned: [], focus: [], unresolved: [], modelName: undefined };
  }

  private upsertFact(state: SessionContextState, fact: ContextPatchFact, now: Date): void {
    const value = fact.value?.trim();
    if (!value || !fact.key) return;
    const tokensEstimate = approxTokens(`${fact.key}: ${value}`);
    const ttl: ContextTtl = fact.ttl ?? 'session';
    const priority = clamp(fact.priority ?? 0.7, 0, 1);
    const tags = (fact.tags ?? []).slice(0, 8);

    const existingIdx = state.pinned.findIndex((p) => p.id === fact.key);
    const item: ContextItem = {
      id: fact.key,
      content: `${fact.key}: ${value}`,
      source: 'explore',
      priority,
      tokensEstimate,
      tags,
      ttl,
      createdAt: existingIdx >= 0 ? state.pinned[existingIdx].createdAt : now,
    };
    if (existingIdx >= 0) {
      state.pinned[existingIdx] = item;
    } else {
      state.pinned.push(item);
    }
  }

  private bumpFocus(state: SessionContextState, keywords: string[], boost: number): void {
    const now = new Date();
    for (const raw of keywords) {
      const kw = raw.trim().toLowerCase();
      if (!kw || kw.length > 80) continue;
      const existing = state.focus.find((f) => f.keyword === kw);
      if (existing) {
        existing.weight = Math.min(5, existing.weight + boost);
        existing.lastSeenAt = now;
      } else {
        state.focus.push({ keyword: kw, weight: Math.min(5, boost), lastSeenAt: now });
      }
    }
    state.focus.sort((a, b) => b.weight - a.weight);
    if (state.focus.length > FOCUS_MAX_ITEMS) {
      state.focus = state.focus.slice(0, FOCUS_MAX_ITEMS);
    }
  }

  private prunePinned(state: SessionContextState): void {
    if (state.pinned.length <= PINNED_MAX_ITEMS) return;
    /** 优先级低、时间旧的先丢 */
    state.pinned.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    state.pinned = state.pinned.slice(0, PINNED_MAX_ITEMS);
  }

  private hashShort(text: string): string {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = (h * 31 + text.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36).slice(0, 8);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function getFocusKeywords(state: SessionContextState): string[] {
  return state.focus.map((f) => f.keyword);
}

export function getActiveFocus(state: SessionContextState, minWeight = 0.2): FocusEntry[] {
  return state.focus.filter((f) => f.weight >= minWeight);
}
