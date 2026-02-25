/**
 * 判别器池 — 支持多个判别器链式/并行处理，加快批量判别
 */
import type { ContentBlock } from '../types.js';
import type { BlockDiscriminator, BlockRenderType } from './types.js';
import {
  byTypeDiscriminator,
  byStructureDiscriminator,
  byContentDiscriminator,
  fallbackDiscriminator,
} from './discriminators.js';

const DEFAULT_CHAIN: BlockDiscriminator[] = [
  byTypeDiscriminator,
  byStructureDiscriminator,
  byContentDiscriminator,
  fallbackDiscriminator,
];

/** 判别器池：可创建多个实例并行处理不同块 */
export class DiscriminatorPool {
  private chain: BlockDiscriminator[];

  constructor(chain: BlockDiscriminator[] = DEFAULT_CHAIN) {
    this.chain = [...chain];
  }

  /** 对单个块进行类型判别 */
  discriminate(block: ContentBlock): BlockRenderType {
    for (const fn of this.chain) {
      const result = fn(block);
      if (result != null) return result;
    }
    return 'content';
  }

  /** 批量判别，可拆分给多个池实例并行处理 */
  discriminateBatch(blocks: ContentBlock[]): BlockRenderType[] {
    return blocks.map((b) => this.discriminate(b));
  }

  /** 创建新的池实例（用于并行处理时分配） */
  static create(chain?: BlockDiscriminator[]): DiscriminatorPool {
    return new DiscriminatorPool(chain);
  }
}

/** 默认单例，供 BlockRenderer 使用 */
export const defaultPool = new DiscriminatorPool();
