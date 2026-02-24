/**
 * 按 block.type 分发到对应块组件，统一承载 secbot 各输出部分
 */
import React from 'react';
import type { ContentBlock as ContentBlockType } from '../../types.js';
import { ApiBlock } from './ApiBlock.js';
import { PhaseBlock } from './PhaseBlock.js';
import { ErrorBlock } from './ErrorBlock.js';
import { PlanningBlock } from './PlanningBlock.js';
import { ThoughtBlock } from './ThoughtBlock.js';
import { ActionsBlock } from './ActionsBlock.js';
import { ResultBlock } from './ResultBlock.js';
import { ReportBlock } from './ReportBlock.js';
import { ResponseBlock } from './ResponseBlock.js';
import { WarningBlock } from './WarningBlock.js';
import { SummaryBlock } from './SummaryBlock.js';
import { CodeBlock } from './CodeBlock.js';

interface BlockRendererProps {
  block: ContentBlockType;
  noMargin?: boolean;
}

/** 折叠占位文案特征（与 contentBlocks 中占位一致） */
function isPlaceholderBody(body: string): boolean {
  return /^\*\(共 \d+ 行/.test(body.trim());
}

export function BlockRenderer({ block, noMargin }: BlockRendererProps) {
  const placeholder = isPlaceholderBody(block.body);

  switch (block.type) {
    case 'api':
      return <ApiBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'phase':
      return <PhaseBlock body={block.body} noMargin={noMargin} />;
    case 'error':
      return <ErrorBlock body={block.body} noMargin={noMargin} />;
    case 'planning':
      return <PlanningBlock block={block} noMargin={noMargin} />;
    case 'thought':
      return <ThoughtBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'actions':
      return <ActionsBlock block={block} noMargin={noMargin} />;
    case 'content':
      return (
        <ResultBlock
          title={block.title}
          body={block.body}
          noMargin={noMargin}
          isPlaceholder={placeholder}
        />
      );
    case 'report':
      return (
        <ReportBlock
          title={block.title}
          body={block.body}
          noMargin={noMargin}
          isPlaceholder={placeholder}
        />
      );
    case 'response':
      return (
        <ResponseBlock
          title={block.title}
          body={block.body}
          noMargin={noMargin}
          isPlaceholder={placeholder}
        />
      );
    case 'warning':
      return <WarningBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'summary':
      return <SummaryBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'code':
      return <CodeBlock title={block.title} body={block.body} noMargin={noMargin} />;
    default:
      return (
        <ResultBlock
          title={block.title}
          body={block.body}
          noMargin={noMargin}
          isPlaceholder={placeholder}
        />
      );
  }
}
