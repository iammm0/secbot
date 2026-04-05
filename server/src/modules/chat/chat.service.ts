import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus, EventType, BusEvent } from '../../common/event-bus';
import {
  RouteType,
  Session,
  createSession,
  TodoItem,
  InteractionSummary,
} from '../../common/types';
import { route, routeWithLLM } from '../agents/core/agent-router';
import { QAAgent } from '../agents/core/qa-agent';
import { PlannerAgent } from '../agents/core/planner-agent';
import { SummaryAgent } from '../agents/core/summary-agent';
import { HackbotAgent } from '../agents/core/hackbot-agent';
import { SuperHackbotAgent } from '../agents/core/superhackbot-agent';
import { SecurityReActAgent } from '../agents/core/security-react-agent';
import { TaskExecutor } from '../agents/core/task-executor';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { ToolsService } from '../tools/tools.service';

/** 与 SecurityReActAgent 中 THINK/EXEC 事件的 step 关联键一致，避免并行子任务共用 iteration 导致前端时间线串台 */
function sseStepKey(data: Record<string, unknown>, iteration: number): string {
  const todoId = data['todoId'];
  if (todoId !== undefined && todoId !== null && String(todoId).length > 0) {
    return `todo-${todoId}`;
  }
  return `iter-${iteration}`;
}

/** CLI 流式输出用：结构化精炼报告 + 较短最终回复，避免刷屏 */
function buildStreamSummaryPayload(summary: InteractionSummary): {
  report: string;
  response: string;
} {
  const findings = summary.keyFindings
    .slice(0, 6)
    .map((l) => `- ${l}`)
    .join('\n');
  const recs = summary.recommendations
    .slice(0, 6)
    .map((l) => `- ${l}`)
    .join('\n');
  const parts: string[] = [];
  const head = summary.taskSummary?.trim();
  if (head) parts.push(`## 摘要\n${head}`);
  if (findings) parts.push(`## 关键发现\n${findings}`);
  if (recs) parts.push(`## 修复建议\n${recs}`);
  const tail = summary.overallConclusion?.trim();
  if (tail) parts.push(`## 总结\n${tail}`);
  let report = parts.join('\n\n');
  if (!report.trim()) {
    report = summary.rawReport?.trim()
      ? summary.rawReport.slice(0, 12_000)
      : '（未能生成摘要，请查看服务端日志。）';
  }
  /** 短收尾：详细章节已在「安全报告」块中展示，避免 TUI 再打一屏重复摘要 */
  const response =
    tail ||
    (summary.keyFindings[0]?.trim() ? `首要发现：${summary.keyFindings[0].trim()}` : '') ||
    '详情见上方「安全报告」。';
  return { report, response };
}

/** 推送规划块（可多次：首屏总规划 + 中途穿插规划），与终端时间线对齐 */
function emitPlanningSse(
  emit: (name: string, data: Record<string, unknown>) => void,
  planSummary: string,
  todos: TodoItem[],
  scope: 'master' | 'adaptive',
): void {
  if (todos.length === 0) return;
  emit('planning', {
    content: planSummary,
    summary: planSummary,
    scope,
    todos: todos.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
    })),
  });
}

@Injectable()
export class ChatService {
  private eventBus = new EventBus();
  private qaAgent: QAAgent;
  private plannerAgent: PlannerAgent;
  private summaryAgent: SummaryAgent;
  private agents: Record<string, SecurityReActAgent>;
  private sessions = new Map<string, Session>();
  private currentSessionId = 'default';

  constructor(
    private readonly config: ConfigService,
    private readonly toolsService: ToolsService,
  ) {
    this.qaAgent = new QAAgent();
    this.plannerAgent = new PlannerAgent();
    this.summaryAgent = new SummaryAgent();

    const hackbot = new HackbotAgent(this.toolsService.getBasicTools());
    const superhackbot = new SuperHackbotAgent(this.toolsService.getAllTools());
    this.agents = { hackbot, superhackbot };

    this.sessions.set(
      this.currentSessionId,
      createSession({ id: this.currentSessionId, agentType: 'hackbot' }),
    );
  }

  async handleMessage(
    body: ChatRequestDto,
    onSSEEvent?: (eventName: string, data: Record<string, unknown>) => void,
  ): Promise<string> {
    const { message, mode, agent: agentType, client_shell: clientShell } = body;
    const forceQA = mode === 'ask';
    const forceAgent = mode === 'agent';

    const emit = (name: string, data: Record<string, unknown>) => {
      onSSEEvent?.(name, data);
    };

    emit('connected', { message: 'stream started' });

    if (forceQA) {
      const session = this.getOrCreateSession();
      const history = session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const answer = await this.qaAgent.answerWithContext(message, history);
      emit('content', { content: answer });
      emit('response', { content: answer, agent: 'qa' });
      emit('done', {});
      return answer;
    }

    const [routeResult] = await this.routeMessage(message);
    if (routeResult === 'qa' && !forceAgent) {
      const answer = await this.qaAgent.answer(message);
      emit('content', { content: answer });
      emit('response', { content: answer, agent: 'qa' });
      emit('done', {});
      return answer;
    }

    const selectedAgent = this.agents[agentType] ?? this.agents['hackbot'];

    emit('phase', { phase: 'planning', detail: '正在分析任务...' });
    const planResult = await this.plannerAgent.plan(message);
    if (planResult.todos.length > 0) {
      emitPlanningSse(emit, planResult.planSummary, planResult.todos, 'master');
    }

    if (planResult.directResponse) {
      emit('content', { content: planResult.directResponse });
      emit('response', { content: planResult.directResponse, agent: agentType });
      emit('done', {});
      return planResult.directResponse;
    }

    emit('phase', { phase: 'executing', detail: '正在执行任务...' });

    const onAgentEvent = (event: BusEvent) => {
      const t = event.type;
      const d = event.data;
      if (t === EventType.THINK_START) {
        const iteration = Number(d['iteration'] ?? 1);
        emit('thought_start', {
          iteration,
          step_key: sseStepKey(d, iteration),
          task: d['task'] as string | undefined,
        });
      } else if (t === EventType.THINK_END) {
        const iteration = Number(d['iteration'] ?? 1);
        emit('thought', {
          content: d['thought'] ?? '',
          iteration,
          step_key: sseStepKey(d, iteration),
        });
      } else if (t === EventType.EXEC_START) {
        const iteration = Number(d['iteration'] ?? 1);
        emit('action_start', {
          tool: d['tool'] ?? '',
          params: d['params'] ?? {},
          iteration,
          step_key: sseStepKey(d, iteration),
        });
      } else if (t === EventType.EXEC_RESULT) {
        const iteration = Number(d['iteration'] ?? 1);
        emit('action_result', {
          tool: d['tool'] ?? '',
          success: d['success'] ?? true,
          result: d['observation'] ?? '',
          iteration,
          step_key: sseStepKey(d, iteration),
        });
      }
    };

    let todosForSummary = [...planResult.todos];

    if (planResult.todos.length > 1) {
      const executor = new TaskExecutor(planResult, selectedAgent, this.eventBus);
      const firstRun = await executor.run(message, onAgentEvent, clientShell);

      /** 默认开启穿插规划；设置 SECBOT_ADAPTIVE_REPLAN=0 或 false 可关闭 */
      const adaptiveOff =
        process.env.SECBOT_ADAPTIVE_REPLAN === '0' ||
        process.env.SECBOT_ADAPTIVE_REPLAN === 'false';

      if (!adaptiveOff && firstRun.cancelledCount > 0) {
        emit('phase', { phase: 'planning', detail: '穿插规划：根据未成功子任务补充方案…' });
        const adaptivePrompt = `${message}\n\n【穿插规划】上一阶段有 ${firstRun.cancelledCount} 个子任务未成功。请仅输出需要补充执行的新子任务 JSON 数组（新 id 建议 followup-1、followup-2）；若无须补充则输出 []。\n\n阶段摘要（节选）：\n${firstRun.summary.slice(0, 4000)}`;
        const subPlan = await this.plannerAgent.plan(adaptivePrompt);
        if (subPlan.todos.length > 0 && !subPlan.directResponse) {
          emitPlanningSse(emit, subPlan.planSummary, subPlan.todos, 'adaptive');
          todosForSummary = [...todosForSummary, ...subPlan.todos];
          emit('phase', { phase: 'executing', detail: '执行穿插任务…' });
          const followUpExecutor = new TaskExecutor(subPlan, selectedAgent, this.eventBus);
          await followUpExecutor.run(message, onAgentEvent, clientShell);
        }
      }
    } else {
      await selectedAgent.process(message, { onEvent: onAgentEvent, client_shell: clientShell });
    }

    emit('phase', { phase: 'summarizing', detail: '正在生成报告...' });
    const summary = await this.summaryAgent.summarizeInteraction(message, {
      todos: todosForSummary,
      thoughts: selectedAgent.reactHistory
        .filter((s) => s.type === 'thought')
        .map((s) => s.content),
      observations: selectedAgent.reactHistory
        .filter((s) => s.type === 'observation')
        .map((s) => s.content),
      mode: todosForSummary.length <= 1 ? 'brief' : 'full',
    });

    const streamPayload = buildStreamSummaryPayload(summary);
    emit('report', { content: streamPayload.report });

    emit('response', { content: streamPayload.response, agent: agentType });
    emit('done', {});
    return streamPayload.response;
  }

  async chatSync(body: ChatRequestDto): Promise<ChatResponseDto> {
    if (body.mode === 'ask') {
      const answer = await this.qaAgent.answer(body.message);
      return { response: answer, agent: 'qa' };
    }
    const selectedAgent = this.agents[body.agent] ?? this.agents['hackbot'];
    const response = await selectedAgent.process(body.message, { client_shell: body.client_shell });
    return { response, agent: body.agent ?? 'hackbot' };
  }

  async rootResponse(_body: { requestId: string; action: string; password?: string }) {
    return {};
  }

  private async routeMessage(message: string): Promise<[RouteType, string | null]> {
    try {
      return await routeWithLLM(message);
    } catch {
      return [route(message), null];
    }
  }

  private getOrCreateSession(): Session {
    let session = this.sessions.get(this.currentSessionId);
    if (!session) {
      session = createSession({ id: this.currentSessionId });
      this.sessions.set(this.currentSessionId, session);
    }
    return session;
  }
}
