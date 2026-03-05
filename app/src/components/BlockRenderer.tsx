// ===================================================================
// 块渲染器 — 根据 RenderBlock.type 分派到对应组件
// ===================================================================

import React from 'react';
import type { RenderBlock } from '../types';

import UserMessageBlock from './UserMessageBlock';
import PlanningBlock from './PlanningBlock';
import ThinkingBlock from './ThinkingBlock';
import ExecutionBlock from './ExecutionBlock';
import ReportBlock from './ReportBlock';
import ResponseBlock from './ResponseBlock';
import ErrorBlock from './ErrorBlock';
import TaskPhaseIndicator from './TaskPhaseIndicator';

interface Props {
  block: RenderBlock;
}

export default function BlockRenderer({ block }: Props) {
  switch (block.type) {
    case 'user':
      return (
        <UserMessageBlock
          content={block.content || ''}
          timestamp={block.timestamp}
        />
      );

    case 'planning':
      return <PlanningBlock content={block.content || ''} />;

    case 'task_phase':
      return (
        <TaskPhaseIndicator
          phase={block.phase || 'thinking'}
          detail={block.detail}
        />
      );

    case 'thinking':
      return (
        <ThinkingBlock
          content={block.content || ''}
          iteration={block.iteration}
          streaming={block.streaming}
          agent={block.agent}
        />
      );

    case 'execution':
      return (
        <ExecutionBlock
          tool={block.tool || 'unknown'}
          params={block.params}
          running={block.streaming}
          agent={block.agent}
        />
      );

    case 'exec_result':
      return (
        <ExecutionBlock
          tool={block.tool || 'unknown'}
          params={block.params}
          success={block.success}
          result={block.result}
          error={block.error}
          agent={block.agent}
        />
      );

    case 'observation':
      return <PlanningBlock content={block.content || ''} />;

    case 'report':
      return (
        <ReportBlock content={block.content || ''} streaming={block.streaming} />
      );

    case 'response':
      return (
        <ResponseBlock
          content={block.content || ''}
          agent={block.agent || block.detail || 'hackbot'}
        />
      );

    case 'error':
      return <ErrorBlock error={block.error || block.content || '未知错误'} />;

    default:
      return null;
  }
}
