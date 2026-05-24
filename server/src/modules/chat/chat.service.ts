import { Injectable } from '@nestjs/common';
import { EventBus, BusEvent } from '../../common/event-bus';
import {
  Session,
  createSession,
  TodoItem,
  IntentDecision,
  MessageRole,
  addSessionMessage,
  ChatMessage,
} from '../../common/types';
import { SecurityReActAgent } from '../agents/core/security-react-agent';
import { TaskExecutor } from '../agents/core/task-executor';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { DatabaseService } from '../database/database.service';
import { ContextAssemblerService } from './context-assembler.service';
import { AgentFactoryService } from './agent-factory.service';
import { mapExceptionToClientBody } from '../../common/errors/map-exception-to-client';
import {
  forwardAgentEvent,
  forwardExploreEvent,
  emitContextUsage,
  emitPlanningSse,
  buildStreamSummaryPayload,
} from './sse-event-forwarder';

@Injectable()
export class ChatService {
  private eventBus = new EventBus();
  private readonly qaAgent;
  private readonly plannerAgent;
  private readonly summaryAgent;
  private readonly intentRouter;
  private readonly exploreAgent;
  private readonly agents: Record<string, SecurityReActAgent>;
  private sessions = new Map<string, Session>();
  private readonly defaultSessionId = 'default';

  constructor(
    private readonly agentFactory: AgentFactoryService,
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssemblerService,
  ) {
    this.qaAgent = this.agentFactory.createQAAgent();
    this.plannerAgent = this.agentFactory.createPlannerAgent();
    this.summaryAgent = this.agentFactory.createSummaryAgent();
    this.intentRouter = this.agentFactory.createIntentRouter();
    this.exploreAgent = this.agentFactory.createExploreAgent();
    this.agents = {
      hackbot: this.agentFactory.createHackbot(),
      superhackbot: this.agentFactory.createSuperhackbot(),
    };

    this.sessions.set(
      this.defaultSessionId,
      createSession({ id: this.defaultSessionId, agentType: 'hackbot' }),
    );
  }

  async handleMessage(
    body: ChatRequestDto,
    onSSEEvent?: (eventName: string, data: Record<string, unknown>) => void,
  ): Promise<string> {
    const { message, mode, agent: agentType, client_shell: clientShell, model: modelName } = body;
    const sessionId = (body.session_id ?? '').trim() || this.defaultSessionId;
    const forceQA = mode === 'ask';
    const forceAgent = mode === 'agent';
    this.getOrCreateSession(sessionId, agentType);
    this.appendSessionMessage(sessionId, MessageRole.USER, message);
    const session = this.getOrCreateSession(sessionId, agentType);

    const emit = (name: string, data: Record<string, unknown>) => {
      onSSEEvent?.(name, data);
    };

    emit('connected', { message: 'stream started' });

    try {
      return await this._handleMessageCore({
        message, mode, agentType, clientShell, modelName, sessionId, session, forceQA, forceAgent, emit,
      });
    } catch (error) {
      const mapped = mapExceptionToClientBody(error);
      emit('error', { error: mapped.message, code: mapped.code, statusCode: mapped.statusCode });
      emit('done', {});
      return `错误：${mapped.message}`;
    }
  }

  private async _handleMessageCore(params: {
    message: string;
    mode?: string;
    agentType?: string;
    clientShell?: ChatRequestDto['client_shell'];
    modelName?: string;
    sessionId: string;
    session: Session;
    forceQA: boolean;
    forceAgent: boolean;
    emit: (name: string, data: Record<string, unknown>) => void;
  }): Promise<string> {
    const { message, agentType, clientShell, modelName, sessionId, session, forceQA, forceAgent, emit } = params;

    /** 1) 启发式 focus 即时更新（IP/CVE/域名/URL/协议词） */
    this.contextAssembler.updateFocusFromInput(sessionId, message);

    /** 2) IntentRouter 一次 LLM 调用拿到 6 类意图 + needs_explore / needs_report */
    const recentForRouter: ChatMessage[] = session.messages.slice(-4).map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));
    const storeBefore = this.contextAssembler.getStoreSnapshot(sessionId);
    const intent = await this.intentRouter.classify({
      userInput: message,
      recentMessages: recentForRouter,
      forceAgent,
      forceQA,
      sessionFocus: storeBefore.focus.map((f) => f.keyword),
      unresolved: storeBefore.unresolved,
    });
    /** Router 给的 focus 并入 store，权重高一些 */
    if (intent.focus.length > 0) {
      this.contextAssembler
        .getStoreSnapshot(sessionId)
        .focus.push(
          ...intent.focus
            .filter((kw) => !storeBefore.focus.some((f) => f.keyword === kw))
            .map((kw) => ({ keyword: kw, weight: 1.5, lastSeenAt: new Date() })),
        );
    }
    emit('intent_decision', {
      intent: intent.intent,
      confidence: intent.confidence,
      needs_explore: intent.needsExplore,
      needs_report: intent.needsReport,
      focus: intent.focus,
      rationale: intent.rationale ?? '',
    });

    /** 3) 非任务类意图：直接回复 / 追问 / QA，跳过编排和报告 */
    const conversational = this.handleConversationalIntent({
      intent,
      message,
      session,
      sessionId,
      agentType: agentType || 'hackbot',
      modelName,
      emit,
    });
    if (conversational.handled) {
      return await conversational.result;
    }

    /** 4) needs_explore：先跑 ExploreAgent，把事实注入 ContextStore */
    if (intent.needsExplore) {
      emit('phase', { phase: 'exploring', detail: '正在收集上下文…' });
      try {
        const patch = await this.exploreAgent.explore({
          userInput: message,
          intent,
          contextBlock: '',
          onEvent: (event) => forwardExploreEvent(event, emit),
        });
        this.contextAssembler.applyPatch(sessionId, patch);
        emit('context_patch', {
          facts_count: patch.facts.length,
          pinned: patch.pinned?.length ?? 0,
          unresolved: patch.unresolved ?? [],
          summary: patch.exploreSummary ?? '',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit('context_patch', { facts_count: 0, error: message });
      }
    }

    /** 5) 组装最终上下文（按当前模型预算 + focus 加权 + pinned 优先级） */
    const selectedAgent = this.agents[agentType ?? 'hackbot'] ?? this.agents['hackbot'];
    const effectiveModelName = modelName || (selectedAgent as any).llm?.model || undefined;
    const context = await this.contextAssembler.build({
      query: message,
      session,
      sessionId,
      agentType: agentType || 'hackbot',
      modelName: effectiveModelName,
    });
    emitContextUsage(emit, context.debug);
    if (process.env.SECBOT_CONTEXT_DEBUG === '1' || process.env.SECBOT_CONTEXT_DEBUG === 'true') {
      emit('context_debug', {
        session_id: sessionId,
        ...context.debug,
      });
    }

    const onAgentEvent = (event: BusEvent) => forwardAgentEvent(event, emit);

    let todosForSummary: TodoItem[] = [];

    if (intent.intent === 'task_simple') {
      /** 单步任务：跳过 Planner，直接 ReAct 一轮 */
      emit('phase', { phase: 'executing', detail: '正在执行任务...' });
      await selectedAgent.process(message, {
        onEvent: onAgentEvent,
        client_shell: clientShell,
        contextBlock: context.contextBlock,
      });
    } else {
      /** task_complex：Planner -> Executor -> 穿插规划 */
      emit('phase', { phase: 'planning', detail: '正在分析任务...' });
      const planResult = await this.plannerAgent.plan(message);
      if (planResult.todos.length > 0) {
        emitPlanningSse(emit, planResult.planSummary, planResult.todos, 'master');
      }

      if (planResult.directResponse) {
        emit('content', { content: planResult.directResponse });
        emit('response', { content: planResult.directResponse, agent: agentType });
        emit('done', {});
        this.persistTurn({
          sessionId,
          userMessage: message,
          assistantMessage: planResult.directResponse,
          agentType: agentType || 'hackbot',
        });
        return planResult.directResponse;
      }

      emit('phase', { phase: 'executing', detail: '正在执行任务...' });
      todosForSummary = [...planResult.todos];

      if (planResult.todos.length > 1) {
        const executor = new TaskExecutor(planResult, selectedAgent, this.eventBus);
        const firstRun = await executor.run(message, onAgentEvent, clientShell, context.contextBlock);

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
            await followUpExecutor.run(message, onAgentEvent, clientShell, context.contextBlock);
          }
        }
      } else {
        await selectedAgent.process(message, {
          onEvent: onAgentEvent,
          client_shell: clientShell,
          contextBlock: context.contextBlock,
        });
      }
    }

    /** 6) needs_report 由 IntentRouter 决定 */
    if (intent.needsReport && intent.intent !== 'task_simple') {
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
      const fullResponse = `${streamPayload.response}\n\n--- 详细报告 ---\n${streamPayload.report}`;
      this.persistTurn({
        sessionId,
        userMessage: message,
        assistantMessage: fullResponse,
        agentType: agentType || 'hackbot',
      });
      return streamPayload.response;
    }

    /** 无报告路径：取最近一条 assistant 思考的 Final Answer / 末段作为回复 */
    const tail = this.lastAgentResponseText(selectedAgent);
    emit('response', { content: tail, agent: agentType });
    emit('done', {});
    this.persistTurn({
      sessionId,
      userMessage: message,
      assistantMessage: tail,
      agentType: agentType || 'hackbot',
    });
    return tail;
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

  // ------ helpers ------

  private handleConversationalIntent(args: {
    intent: IntentDecision;
    message: string;
    session: Session;
    sessionId: string;
    agentType: string;
    modelName?: string;
    emit: (name: string, data: Record<string, unknown>) => void;
  }): { handled: boolean; result: Promise<string> } {
    const { intent, message, session, sessionId, agentType, modelName, emit } = args;

    const finishWith = async (answer: string, agentTag: string): Promise<string> => {
      emit('content', { content: answer });
      emit('response', { content: answer, agent: agentTag });
      emit('done', {});
      this.persistTurn({
        sessionId,
        userMessage: message,
        assistantMessage: answer,
        agentType: agentTag,
      });
      return answer;
    };

    if (intent.intent === 'small_talk' || intent.intent === 'meta') {
      const answer =
        intent.directResponse?.trim() ||
        (intent.intent === 'small_talk' ? '收到～有需要执行的安全任务随时说。' : '我会尽量帮你查清楚。');
      return { handled: true, result: finishWith(answer, intent.intent) };
    }

    if (intent.intent === 'qa') {
      return {
        handled: true,
        result: (async () => {
          const qaModelName = modelName || (this.qaAgent as any).llm?.model || undefined;
          const ctx = await this.contextAssembler.build({
            query: message,
            session,
            sessionId,
            agentType,
            modelName: qaModelName,
          });
          emitContextUsage(emit, ctx.debug);
          const history = session.messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          }));
          let answer: string;
          if (intent.directResponse?.trim()) {
            answer = intent.directResponse.trim();
          } else {
            answer = await this.qaAgent.answerWithContext(message, history, ctx.contextBlock, (chunk) => {
              emit('response_chunk', { chunk });
            });
          }
          emit('response', { content: answer, agent: 'qa' });
          emit('done', {});
          this.persistTurn({ sessionId, userMessage: message, assistantMessage: answer, agentType: 'qa' });
          return answer;
        })(),
      };
    }

    if (intent.intent === 'clarify_needed') {
      const q =
        intent.clarifyQuestion?.trim() ||
        '我需要确认几个关键点：目标是什么？你期望的范围/产出是什么？是否已获得授权？';
      emit('clarify', { question: q });
      return { handled: true, result: finishWith(q, 'router') };
    }

    return { handled: false, result: Promise.resolve('') };
  }

  private lastAgentResponseText(agent: SecurityReActAgent): string {
    /** SecurityReActAgent 把最终回复加到了 conversationHistory，取最后一条 assistant */
    const history = agent.getConversationHistory(2);
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant' && history[i].content.trim()) {
        return history[i].content;
      }
    }
    return '已完成。';
  }

  private getOrCreateSession(sessionId: string, agentType?: string): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = createSession({ id: sessionId, agentType: agentType || 'hackbot' });
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  private appendSessionMessage(sessionId: string, role: MessageRole, content: string): void {
    const current = this.getOrCreateSession(sessionId);
    this.sessions.set(sessionId, addSessionMessage(current, role, content));
  }

  private persistTurn(params: {
    sessionId: string;
    userMessage: string;
    assistantMessage: string;
    agentType: string;
  }): void {
    const { sessionId, userMessage, assistantMessage, agentType } = params;
    this.appendSessionMessage(sessionId, MessageRole.ASSISTANT, assistantMessage);
    try {
      this.databaseService.saveConversation({
        agentType,
        userMessage,
        assistantMessage,
        sessionId,
        timestamp: new Date().toISOString(),
        metadata: '{}',
      });
      void this.contextAssembler.rememberTurn({
        sessionId,
        agentType,
        userMessage,
        assistantMessage,
      });
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }
}
