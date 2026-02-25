/**
 * 按消息类型判别模块的输出分发到对应块组件，统一承载 secbot 各输出部分
 * 每个消息块先经 blockDiscriminators 判别，再交由对应渲染组件
 */
import React from 'react';
import type { ContentBlock as ContentBlockType } from '../../types.js';
import { defaultPool } from '../../blockDiscriminators/index.js';
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
import { JsonBlock } from './JsonBlock.js';
import { TableBlock } from './TableBlock.js';
import { BulletBlock } from './BulletBlock.js';
import { NumberedBlock } from './NumberedBlock.js';
import { QuoteBlock } from './QuoteBlock.js';
import { HeadingBlock } from './HeadingBlock.js';
import { DividerBlock } from './DividerBlock.js';
import { LinkBlock } from './LinkBlock.js';
import { KeyValueBlock } from './KeyValueBlock.js';
import { DiffBlock } from './DiffBlock.js';
import { TerminalBlock } from './TerminalBlock.js';
import { SecurityBlock } from './SecurityBlock.js';
import { ToolResultBlock } from './ToolResultBlock.js';
import { ExceptionBlock } from './ExceptionBlock.js';
import { SuggestionBlock } from './SuggestionBlock.js';
import { SuccessBlock } from './SuccessBlock.js';
import { InfoBlock } from './InfoBlock.js';

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
  const renderType = block.resolvedType ?? defaultPool.discriminate(block);

  switch (renderType) {
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
    case 'json':
      return <JsonBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'table':
      return <TableBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'bullet':
      return <BulletBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'numbered':
      return <NumberedBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'quote':
      return <QuoteBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'heading':
      return <HeadingBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'divider':
      return <DividerBlock body={block.body} noMargin={noMargin} />;
    case 'link':
      return <LinkBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'key_value':
      return <KeyValueBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'diff':
      return <DiffBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'terminal':
      return <TerminalBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'security':
      return <SecurityBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'tool_result':
      return (
        <ToolResultBlock
          title={block.title}
          body={block.body}
          noMargin={noMargin}
          isPlaceholder={placeholder}
        />
      );
    case 'exception':
      return <ExceptionBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'suggestion':
      return <SuggestionBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'success':
      return <SuccessBlock title={block.title} body={block.body} noMargin={noMargin} />;
    case 'info':
      return <InfoBlock title={block.title} body={block.body} noMargin={noMargin} />;
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
