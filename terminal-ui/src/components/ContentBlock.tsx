/**
 * 单块内容：委托 BlockRenderer 按类型渲染 secbot 各输出部分
 */
import React from 'react';
import type { ContentBlock as ContentBlockType } from '../types.js';
import { BlockRenderer } from './blocks/BlockRenderer.js';

interface ContentBlockProps {
  block: ContentBlockType;
  /** 在滚动区内使用时为 true，不增加块间距，由外层控制高度 */
  noMargin?: boolean;
}

export function ContentBlock({ block, noMargin }: ContentBlockProps) {
  return <BlockRenderer block={block} noMargin={noMargin} />;
}
