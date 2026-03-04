import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus, EventType, BusEvent } from '../../common/event-bus';
import {
  ChatMessage,
  RouteType,
  Session,
  createSession,
  addSessionMessage,
  MessageRole,
  PlanResult,
  TodoItem,
  createTodoItem,
  TodoStatus,
  markTodoInProgress,
  markTodoCompleted,
  InteractionSummary,
} from '../../common/types';
import { createLLM, LLMProvider } from '../../common/llm';
import { route, routeWithLLM } from '../agents/core/agent-router';
import { QAAgent } from '../agents/core/qa-agent';
import { PlannerAgent } from '../agents/core/planner-agent';
import { SummaryAgent } from '../agents/core/summary-agent';
import { HackbotAgent } from '../agents/core/hackbot-agent';
import { SuperHackbotAgent } from '../agents/core/superhackbot-agent';
import { SecurityReActAgent } from '../agents/core/security-react-agent';
import { TaskExecutor } from '../agents/core/task-executor';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  private eventBus = new EventBus();
  private qaAgent: QAAgent;
  private plannerAgent: PlannerAgent;
  private summaryAgent: SummaryAgent;
  private agents: Record<string, SecurityReActAgent>;
  private sessions = new Map<string, Session>();
  private currentSessionId = 'default';

  constructor(private readonly config: ConfigService) {
    this.qaAgent = new QAAgent();
    this.plannerAgent = new PlannerAgent();
    this.summaryAgent = new SummaryAgent();

    const hackbot = new HackbotAgent([]);
    const superhackbot = new SuperHackbotAgent([]);
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
    const { message, mode, agent: agentType } = body;
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
      emit('planning', {
        summary: planResult.planSummary,
        todos: planResult.todos.map((t) => ({
          id: t.id,
          content: t.content,
          status: t.status,
        })),
      });
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
        emit('thought_start', { iteration: d['iteration'] ?? 1 });
      } else if (t === EventType.THINK_END) {
        emit('thought', {
          content: d['thought'] ?? '',
          iteration: d['iteration'] ?? 1,
        });
      } else if (t === EventType.EXEC_START) {
        emit('action_start', {
          tool: d['tool'] ?? '',
          params: d['params'] ?? {},
          iteration: d['iteration'] ?? 1,
        });
      } else if (t === EventType.EXEC_RESULT) {
        emit('action_result', {
          tool: d['tool'] ?? '',
          success: d['success'] ?? true,
          result: d['observation'] ?? '',
          iteration: d['iteration'] ?? 1,
        });
      }
    };

    let response: string;
    if (planResult.todos.length > 1) {
      const executor = new TaskExecutor(planResult, selectedAgent, this.eventBus);
      response = await executor.run(message, onAgentEvent);
    } else {
      response = await selectedAgent.process(message, { onEvent: onAgentEvent });
    }

    emit('phase', { phase: 'summarizing', detail: '正在生成报告...' });
    const summary = await this.summaryAgent.summarizeInteraction(message, {
      todos: planResult.todos,
      thoughts: selectedAgent.reactHistory
        .filter((s) => s.type === 'thought')
        .map((s) => s.content),
      observations: selectedAgent.reactHistory
        .filter((s) => s.type === 'observation')
        .map((s) => s.content),
      mode: planResult.todos.length <= 1 ? 'brief' : 'full',
    });

    if (summary.rawReport) {
      emit('report', { content: summary.rawReport });
    }

    emit('response', { content: response, agent: agentType });
    emit('done', {});
    return response;
  }

  async chatSync(body: ChatRequestDto): Promise<ChatResponseDto> {
    if (body.mode === 'ask') {
      const answer = await this.qaAgent.answer(body.message);
      return { response: answer, agent: 'qa' };
    }
    const selectedAgent = this.agents[body.agent] ?? this.agents['hackbot'];
    const response = await selectedAgent.process(body.message);
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
