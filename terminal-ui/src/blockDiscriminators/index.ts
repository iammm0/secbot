/**
 * 消息块类型判别模块 — 统一入口
 * 每个消息块经此模块判别后，交由对应渲染组件渲染
 */
export type { BlockDiscriminator, BlockRenderType } from './types.js';
export {
  byTypeDiscriminator,
  byContentDiscriminator,
  byStructureDiscriminator,
  fallbackDiscriminator,
} from './discriminators.js';
export { DiscriminatorPool, defaultPool } from './pool.js';
