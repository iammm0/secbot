/**
 * 消息块类型判别模块 — 类型定义
 */
import type { ContentBlock } from '../types.js';

export type BlockRenderType = ContentBlock['type'];

/** 判别器：根据块信息返回应使用的渲染类型，返回 null 表示交给下一个判别器 */
export type BlockDiscriminator = (block: ContentBlock) => BlockRenderType | null;
