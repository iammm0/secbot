import { Injectable } from '@nestjs/common';
import { EventBus, BusEvent } from '../../common/event-bus';
import {
  Session,
  createSession,
  TodoItem,
  TodoStatus,
  IntentDecision,
  MessageRole,
  addSessionMessage,
  ChatMessage,
  createTodoItem,
  PlanResult,
  RequestType,
  PausedTaskSnapshot,
} from '../../common/types';
import { SecurityReActAgent, REACT_OPERATING_POLICY } from '../agents/core/security-react-agent';
import { TaskExecutor } from '../agents/core/task-executor';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { DatabaseService } from '../database/database.service';
import { ContextAssemblerService } from './context-assembler.service';
import { AgentFactoryService } from './agent-factory.service';
import { PreferencesService } from '../preferences/preferences.service';
import { ExecutionRouter } from '../workspaces/execution-router';
import { executionContext } from '../workspaces/execution-context';
import { resolveAgentType } from './resolve-agent';
import {
  parseConversationMeta,
  stringifyConversationMeta,
  type SlimTimelineItem,
} from './conversation-meta';
import { mapExceptionToClientBody } from '../../common/errors/map-exception-to-client';
import {
  forwardAgentEvent,
  forwardExploreEvent,
  emitContextUsage,
  emitPlanningSse,
  buildStreamSummaryPayload,
} from './sse-event-forwarder';
import {
  buildResumePrompt,
  isTaskPausedError,
  looksLikeContinue,
  mergePausedSnapshot,
  snapshotTodos,
  throwIfAborted,
  TaskPausedError,
} from './paused-task';
import {
  rejectSessionHumanRequests,
  resolveConfirmRequest,
  resolveUserInputRequest,
} from './human-input-bridge';
import { usagePart, type ContextUsagePart } from './context-usage';
import { approxTokens } from './model-context-window';
import { runWithWorkflowTracer, WorkflowTracer } from './workflow-trace';
import { shouldSkipAdaptiveReplan } from '../../common/jev';

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
  private readonly sessionLocks = new Map<string, Promise<unknown>>();
  private readonly defaultSessionId = 'default';

  constructor(
    private readonly agentFactory: AgentFactoryService,
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssemblerService,
    private readonly preferences: PreferencesService,
    private readonly executionRouter: ExecutionRouter,
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
  }

  async handleMessage(
    body: ChatRequestDto,
    onSSEEvent?: (eventName: string, data: Record<string, unknown>) => void,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const { message, client_shell: clientShell, model: modelName } = body;
    const agentType = resolveAgentType(body.agent);
    const sessionId = (body.session_id ?? '').trim() || this.defaultSessionId;

    const emit = (name: string, data: Record<string, unknown>) => {
      onSSEEvent?.(name, data);
    };

    return this.withSessionLock(sessionId, async () => {
      const workspaceId = (body.workspace_id ?? '').trim();
      const nodeId = (body.node_id ?? '').trim();
      if (workspaceId) {
        try {
          this.databaseService.bindWorkspaceSession(workspaceId, sessionId, nodeId || null);
        } catch {
          /* binding is best-effort; chat still proceeds */
        }
      }
      const target = this.executionRouter.resolve({ sessionId, workspaceId, nodeId });
      if (target.kind === 'secbot') {
        return this.executionRouter.proxyChat(
          target,
          { ...body, agent: agentType },
          emit,
          abortSignal,
        );
      }

      return executionContext.run(target, async () => {
        this.getOrCreateSession(sessionId, agentType);
        this.appendSessionMessage(sessionId, MessageRole.USER, message);
        const session = this.getOrCreateSession(sessionId, agentType);
        const tracer = new WorkflowTracer(emit, sessionId, agentType || 'hackbot');

        emit('connected', { message: 'stream started' });

        return runWithWorkflowTracer(tracer, async () => {
          try {
            return await this._handleMessageCore({
              message,
              agentType,
              clientShell,
              modelName,
              sessionId,
              session,
              emit,
              abortSignal,
              resume: body.resume === true,
              resumeFrom: body.resume_from,
              tracer,
            });
          } catch (error) {
            if (isTaskPausedError(error)) {
              return this.finishPaused({
                sessionId,
                userMessage: message,
                agentType: agentType || 'hackbot',
                snapshot: error.snapshot,
                emit,
              });
            }
            const mapped = mapExceptionToClientBody(error);
            emit('error', {
              error: mapped.message,
              code: mapped.code,
              statusCode: mapped.statusCode,
            });
            emit('done', {});
            return `错误：${mapped.message}`;
          } finally {
            tracer.finish();
          }
        });
      });
    });
  }

  private async _handleMessageCore(params: {
    message: string;
    agentType?: string;
    clientShell?: ChatRequestDto['client_shell'];
    modelName?: string;
    sessionId: string;
    session: Session;
    emit: (name: string, data: Record<string, unknown>) => void;
    abortSignal?: AbortSignal;
    resume?: boolean;
    resumeFrom?: string;
    tracer?: WorkflowTracer;
  }): Promise<string> {
    const {
      message,
      agentType,
      clientShell,
      modelName,
      sessionId,
      session,
      emit,
      abortSignal,
      resume,
      resumeFrom,
      tracer,
    } = params;

    /** 1) 启发式 focus 即时更新（IP/CVE/域名/URL/协议词） */
    this.contextAssembler.updateFocusFromInput(sessionId, message);

    /** 2) IntentRouter：同步产品画像 + 精简会话上下文后分类（meta 可直接答） */
    const storeBefore = this.contextAssembler.getStoreSnapshot(sessionId);
    const classify = () =>
      this.intentRouter.classify(
        this.buildIntentRouteArgs({
          message,
          session,
          sessionId,
          agentType,
          modelName,
        }),
      );
    const intent = await (tracer ? tracer.stage('classify', classify) : classify());
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

    const storedPaused = this.contextAssembler.getPausedTask(sessionId);
    const paused: PausedTaskSnapshot | null =
      storedPaused ??
      (resumeFrom?.trim()
        ? { originalMessage: resumeFrom.trim(), progressNote: '', todos: [] }
        : null);
    const forceResume = Boolean(paused && (resume || looksLikeContinue(message)));

    /** 3) 非任务类意图：直接回复 / 追问 / QA，跳过编排和报告（暂停中点「继续」除外） */
    if (!forceResume) {
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
        return await (tracer
          ? tracer.stage('conversational', () => conversational.result, intent.intent)
          : conversational.result);
      }
    }

    let workingMessage = message;
    let originalGoal = message;
    let resuming = false;
    if (
      paused &&
      (forceResume || intent.intent === 'task_simple' || intent.intent === 'task_complex')
    ) {
      resuming = true;
      originalGoal = paused.originalMessage || message;
      workingMessage = buildResumePrompt(paused, message);
      this.contextAssembler.clearPausedTask(sessionId);
    }

    throwIfAborted(abortSignal, { originalMessage: originalGoal });

    let selectedAgent: SecurityReActAgent | undefined;
    let todosForSummary: TodoItem[] = [];

    try {
      /** 4) needs_explore：先跑 ExploreAgent，把事实注入 ContextStore */
      if (intent.needsExplore && !resuming) {
        emit('phase', { phase: 'exploring', detail: '正在收集上下文…' });
        try {
          const patch = await (tracer
            ? tracer.stage('explore', () =>
                this.exploreAgent.explore({
                  userInput: workingMessage,
                  intent,
                  contextBlock: '',
                  onEvent: (event) => forwardExploreEvent(event, emit),
                  abortSignal,
                }),
              )
            : this.exploreAgent.explore({
                userInput: workingMessage,
                intent,
                contextBlock: '',
                onEvent: (event) => forwardExploreEvent(event, emit),
                abortSignal,
              }));
          this.contextAssembler.applyPatch(sessionId, patch);
          emit('context_patch', {
            facts_count: patch.facts.length,
            pinned: patch.pinned?.length ?? 0,
            unresolved: patch.unresolved ?? [],
            summary: patch.exploreSummary ?? '',
          });
        } catch (error) {
          if (isTaskPausedError(error)) throw error;
          const errText = error instanceof Error ? error.message : String(error);
          emit('context_patch', { facts_count: 0, error: errText });
        }
      }

      /** 5) 组装最终上下文（按当前模型预算 + focus 加权 + pinned 优先级） */
      selectedAgent = this.agents[agentType ?? 'hackbot'] ?? this.agents['hackbot'];
      const effectiveModelName = modelName || resolveAgentModelName(selectedAgent);
      const skipVector = intent.intent === 'task_simple' || intent.intent === 'qa';
      const context = await (tracer
        ? tracer.stage('context_build', () =>
            this.contextAssembler.build({
              query: workingMessage,
              session,
              sessionId,
              agentType: agentType || 'hackbot',
              modelName: effectiveModelName,
              skipVector,
            }),
          )
        : this.contextAssembler.build({
            query: workingMessage,
            session,
            sessionId,
            agentType: agentType || 'hackbot',
            modelName: effectiveModelName,
            skipVector,
          }));
      emitContextUsage(
        emit,
        context.debug,
        this.promptUsageExtras({
          agent: selectedAgent,
          userText: workingMessage,
          includeTools: true,
        }),
      );
      if (process.env.SECBOT_CONTEXT_DEBUG === '1' || process.env.SECBOT_CONTEXT_DEBUG === 'true') {
        emit('context_debug', {
          session_id: sessionId,
          ...context.debug,
        });
      }

      const withStage = <T>(name: string, fn: () => Promise<T>, detail?: string): Promise<T> =>
        tracer ? tracer.stage(name, fn, detail) : fn();

      const onAgentEvent = (event: BusEvent) => forwardAgentEvent(event, emit);
      const runProcess = async (prompt: string) => {
        throwIfAborted(abortSignal, {
          originalMessage: originalGoal,
          todos: snapshotTodos(todosForSummary),
        });
        await selectedAgent!.process(prompt, {
          onEvent: onAgentEvent,
          client_shell: clientShell,
          contextBlock: context.contextBlock,
          abortSignal,
          sessionId,
        });
      };
      const runExecutor = async (plan: PlanResult, prompt: string) => {
        const executor = new TaskExecutor(plan, selectedAgent!, this.eventBus);
        return executor.run(
          prompt,
          onAgentEvent,
          clientShell,
          context.contextBlock,
          abortSignal,
          sessionId,
        );
      };

      const remainingFromPause = resuming && paused ? this.todosFromPausedSnapshot(paused) : [];

      if (remainingFromPause.length > 0) {
        emit('phase', { phase: 'executing', detail: '从中断处继续原任务…' });
        todosForSummary = [...remainingFromPause];
        const resumePlan: PlanResult = {
          requestType: RequestType.TECHNICAL,
          todos: remainingFromPause,
          directResponse: null,
          planSummary: '从中断处继续未完成子任务',
        };
        emitPlanningSse(emit, resumePlan.planSummary, resumePlan.todos, 'master');
        if (remainingFromPause.length > 1) {
          await withStage('execute', () => runExecutor(resumePlan, workingMessage), 'resume-todos');
        } else {
          await withStage('execute', () => runProcess(workingMessage), 'resume-react');
        }
      } else if (
        intent.intent === 'task_simple' ||
        (resuming && intent.intent !== 'task_complex')
      ) {
        emit('phase', {
          phase: 'executing',
          detail: resuming ? '从中断处继续原任务…' : '正在执行任务...',
        });
        await withStage('execute', () => runProcess(workingMessage), 'react');
      } else {
        emit('phase', { phase: 'planning', detail: '正在分析任务...' });
        throwIfAborted(abortSignal, { originalMessage: originalGoal });
        const planResult = await withStage('plan', () => this.plannerAgent.plan(workingMessage));
        if (planResult.todos.length > 0) {
          emitPlanningSse(emit, planResult.planSummary, planResult.todos, 'master');
        }

        if (planResult.directResponse) {
          this.contextAssembler.clearPausedTask(sessionId);
          emit('content', { content: planResult.directResponse });
          emit('response', { content: planResult.directResponse, agent: agentType });
          emit('done', {});
          this.persistTurn({
            sessionId,
            userMessage: message,
            assistantMessage: planResult.directResponse,
            agentType: agentType || 'hackbot',
            agent: selectedAgent,
          });
          return planResult.directResponse;
        }

        emit('phase', { phase: 'executing', detail: '正在执行任务...' });
        todosForSummary = [...planResult.todos];

        if (planResult.todos.length > 1) {
          const firstRun = await withStage(
            'execute',
            () => runExecutor(planResult, workingMessage),
            'todos',
          );

          const adaptiveOn =
            process.env.SECBOT_ADAPTIVE_REPLAN === '1' ||
            process.env.SECBOT_ADAPTIVE_REPLAN === 'true';

          if (adaptiveOn && firstRun.cancelledCount > 0) {
            const skipReplan = await shouldSkipAdaptiveReplan(
              firstRun.summary,
              firstRun.cancelledCount,
            );
            if (skipReplan) {
              emit('phase', {
                phase: 'executing',
                detail: 'Jev 判断失败子任务不值得再规划，跳过穿插规划',
              });
            } else {
              throwIfAborted(abortSignal, {
                originalMessage: originalGoal,
                todos: snapshotTodos(todosForSummary),
              });
              emit('phase', { phase: 'planning', detail: '穿插规划：根据未成功子任务补充方案…' });
              const adaptivePrompt = `${workingMessage}\n\n【穿插规划】上一阶段有 ${firstRun.cancelledCount} 个子任务未成功。请仅输出需要补充执行的新子任务 JSON 数组（新 id 建议 followup-1、followup-2）；若无须补充则输出 []。\n\n阶段摘要（节选）：\n${firstRun.summary.slice(0, 4000)}`;
              const subPlan = await withStage(
                'plan',
                () => this.plannerAgent.plan(adaptivePrompt),
                'adaptive',
              );
              if (subPlan.todos.length > 0 && !subPlan.directResponse) {
                emitPlanningSse(emit, subPlan.planSummary, subPlan.todos, 'adaptive');
                todosForSummary = [...todosForSummary, ...subPlan.todos];
                emit('phase', { phase: 'executing', detail: '执行穿插任务…' });
                await withStage('execute', () => runExecutor(subPlan, workingMessage), 'followup');
              }
            }
          }
        } else {
          await withStage('execute', () => runProcess(workingMessage), 'react');
        }
      }

      /** 6) needs_report 由 IntentRouter 决定；无有效 todo 发现则跳过 Summary */
      const hasUsefulTodoFindings =
        todosForSummary.length === 0
          ? false
          : todosForSummary.some(
              (todo) => todo.status === TodoStatus.COMPLETED && Boolean(todo.resultSummary?.trim()),
            );
      if (intent.needsReport && intent.intent !== 'task_simple' && hasUsefulTodoFindings) {
        throwIfAborted(abortSignal, {
          originalMessage: originalGoal,
          todos: snapshotTodos(todosForSummary),
        });
        emit('phase', { phase: 'summarizing', detail: '正在生成报告...' });
        const summary = await withStage('summarize', () =>
          this.summaryAgent.summarizeInteraction(workingMessage, {
            todos: todosForSummary,
            thoughts: selectedAgent!.reactHistory
              .filter((s) => s.type === 'thought')
              .map((s) => s.content),
            observations: selectedAgent!.reactHistory
              .filter((s) => s.type === 'observation')
              .map((s) => s.content),
            mode: todosForSummary.length <= 1 ? 'brief' : 'full',
          }),
        );

        const streamPayload = buildStreamSummaryPayload(summary);
        this.contextAssembler.clearPausedTask(sessionId);
        emit('report', { content: streamPayload.report });
        emit('response', { content: streamPayload.response, agent: agentType });
        emit('done', {});
        const fullResponse = `${streamPayload.response}\n\n--- 详细报告 ---\n${streamPayload.report}`;
        this.persistTurn({
          sessionId,
          userMessage: message,
          assistantMessage: fullResponse,
          agentType: agentType || 'hackbot',
          agent: selectedAgent,
        });
        return streamPayload.response;
      }

      const tail = this.lastAgentResponseText(selectedAgent);
      this.contextAssembler.clearPausedTask(sessionId);
      emit('response', { content: tail, agent: agentType });
      emit('done', {});
      this.persistTurn({
        sessionId,
        userMessage: message,
        assistantMessage: tail,
        agentType: agentType || 'hackbot',
        agent: selectedAgent,
      });
      return tail;
    } catch (error) {
      if (isTaskPausedError(error)) {
        throw new TaskPausedError(
          mergePausedSnapshot(error.snapshot, {
            originalMessage: originalGoal,
            todos: error.snapshot.todos.length
              ? error.snapshot.todos
              : snapshotTodos(todosForSummary),
            progressNote: error.snapshot.progressNote || this.progressNoteFromAgent(selectedAgent),
          }),
        );
      }
      throw error;
    }
  }

  async chatSync(body: ChatRequestDto): Promise<ChatResponseDto> {
    const sessionId = (body.session_id ?? '').trim() || this.defaultSessionId;
    const agentType = resolveAgentType(body.agent);
    this.getOrCreateSession(sessionId, agentType);
    const session = this.getOrCreateSession(sessionId, agentType);
    const intent = await this.intentRouter.classify(
      this.buildIntentRouteArgs({
        message: body.message,
        session,
        sessionId,
        agentType,
        modelName: body.model,
      }),
    );
    const recentForRouter: ChatMessage[] = session.messages.slice(-8).map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    if (intent.intent === 'small_talk' || intent.intent === 'meta') {
      const answer =
        intent.directResponse?.trim() ||
        (intent.intent === 'small_talk'
          ? '收到～有需要执行的安全任务随时说。'
          : '我是 Secbot，授权范围内的安全自动化工作台。可以直接问我能力/工具/当前会话，或甩一个已授权目标。');
      return { response: answer, agent: intent.intent };
    }

    if (intent.intent === 'qa') {
      const answer = await this.qaAgent.answerAdaptive(body.message, recentForRouter);
      return { response: answer, agent: 'qa' };
    }

    if (intent.intent === 'clarify_needed') {
      return {
        response:
          intent.clarifyQuestion?.trim() ||
          '我需要确认几个关键点：目标是什么？你期望的范围/产出是什么？是否已获得授权？',
        agent: 'router',
      };
    }
    const selectedAgent = this.agents[agentType] ?? this.agents['hackbot'];
    const response = await selectedAgent.process(body.message, { client_shell: body.client_shell });
    return { response, agent: agentType };
  }

  async rootResponse(_body: { requestId: string; action: string; password?: string }) {
    return {};
  }

  confirmResponse(body: {
    request_id: string;
    action: 'allow' | 'deny' | 'always_allow';
    session_id?: string;
  }) {
    const ok = resolveConfirmRequest(body.request_id, body.action, body.session_id);
    return { ok, request_id: body.request_id };
  }

  userInputResponse(body: {
    request_id: string;
    selected?: string[];
    text?: string;
    session_id?: string;
  }) {
    const ok = resolveUserInputRequest(
      body.request_id,
      { selected: body.selected, text: body.text },
      body.session_id,
    );
    return { ok, request_id: body.request_id };
  }

  listPersistedSessions(query: { limit?: number; offset?: number }) {
    return this.databaseService.listConversationSessions(query);
  }

  getPersistedSessionHistory(sessionId: string, query: { limit?: number; offset?: number }) {
    return this.databaseService.getConversationHistoryPage(sessionId, query);
  }

  patchPersistedSession(sessionId: string, body: { title?: string }) {
    const id = sessionId.trim();
    const title = body.title?.trim();
    if (title) this.databaseService.updateSessionTitle(id, title);
    return { ok: true, sessionId: id, title: title || undefined };
  }

  deletePersistedSession(sessionId: string) {
    const id = sessionId.trim();
    this.sessions.delete(id);
    this.contextAssembler.clearPausedTask(id);
    const deleted = this.databaseService.deleteChatSession(id);
    return { ok: true, sessionId: id, deleted };
  }

  // ------ helpers ------

  private buildIntentRouteArgs(args: {
    message: string;
    session: Session;
    sessionId: string;
    agentType?: string;
    modelName?: string;
  }) {
    const brief = this.contextAssembler.summarizeForRouter(args.sessionId, args.session);
    return {
      userInput: args.message,
      recentMessages: brief.recentMessages,
      sessionFocus: brief.sessionFocus,
      unresolved: brief.unresolved,
      pinnedFacts: brief.pinnedFacts,
      customInstructions: this.preferences.getCustomInstructions() || undefined,
      pausedTask: brief.pausedTask,
      agentType: args.agentType || 'hackbot',
      modelName: args.modelName,
      toolCatalog: this.agentFactory.getToolCatalogCompact(),
    };
  }

  private promptUsageExtras(args: {
    agent: { getSystemPrompt?: () => string };
    userText: string;
    includeTools: boolean;
  }): ContextUsagePart[] {
    const systemText = [
      args.agent.getSystemPrompt?.() ?? '',
      args.includeTools ? REACT_OPERATING_POLICY : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    return [
      usagePart('system', approxTokens(systemText)),
      ...(args.includeTools ? this.agentFactory.getDefinitionUsageParts() : []),
      usagePart('user', approxTokens(args.userText)),
    ].filter((part): part is ContextUsagePart => part != null);
  }

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
        (intent.intent === 'small_talk'
          ? '收到～有需要执行的安全任务随时说。'
          : '我是 Secbot，授权范围内的安全自动化工作台。可以直接问我能力/工具/当前会话，或甩一个已授权目标。');
      return { handled: true, result: finishWith(answer, intent.intent) };
    }

    if (intent.intent === 'qa') {
      return {
        handled: true,
        result: (async () => {
          const qaModelName = modelName || resolveAgentModelName(this.qaAgent);
          const ctx = await this.contextAssembler.build({
            query: message,
            session,
            sessionId,
            agentType,
            modelName: qaModelName,
            skipVector: true,
          });
          emitContextUsage(
            emit,
            ctx.debug,
            this.promptUsageExtras({
              agent: this.qaAgent,
              userText: message,
              includeTools: false,
            }),
          );
          const history = session.messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          }));
          const answer = await this.qaAgent.answerAdaptive(
            message,
            history,
            ctx.contextBlock,
            (chunk) => {
              emit('response_chunk', { chunk });
            },
          );
          return await finishWith(answer, 'qa');
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

  private progressNoteFromAgent(agent?: SecurityReActAgent): string {
    if (!agent) return '';
    return agent.reactHistory
      .slice(-6)
      .map((step) => step.content)
      .join('\n')
      .slice(0, 4000);
  }

  private todosFromPausedSnapshot(paused: PausedTaskSnapshot): TodoItem[] {
    return paused.todos
      .filter(
        (todo) => todo.status !== TodoStatus.COMPLETED && todo.status !== TodoStatus.CANCELLED,
      )
      .map((todo) =>
        createTodoItem({
          id: todo.id,
          content: todo.content,
          status:
            todo.status === TodoStatus.IN_PROGRESS
              ? TodoStatus.PENDING
              : (todo.status as TodoStatus),
        }),
      );
  }

  private finishPaused(params: {
    sessionId: string;
    userMessage: string;
    agentType: string;
    snapshot: PausedTaskSnapshot;
    emit: (name: string, data: Record<string, unknown>) => void;
  }): string {
    const { sessionId, userMessage, agentType, emit } = params;
    rejectSessionHumanRequests(sessionId, '任务已暂停');
    const snapshot = mergePausedSnapshot(params.snapshot, {
      originalMessage: params.snapshot.originalMessage || userMessage,
    });
    this.contextAssembler.setPausedTask(sessionId, snapshot);
    const reply = '任务已暂停。发送消息即可从中断处继续原任务。';
    emit('paused', {
      original_message: snapshot.originalMessage,
      todos: snapshot.todos,
    });
    emit('response', { content: reply, agent: agentType });
    emit('done', { paused: true });
    this.persistTurn({
      sessionId,
      userMessage,
      assistantMessage: reply,
      agentType,
    });
    return reply;
  }

  private async withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.sessionLocks.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.sessionLocks.set(
      sessionId,
      previous.then(() => current).catch(() => current),
    );
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.sessionLocks.get(sessionId) === current) {
        this.sessionLocks.delete(sessionId);
      }
    }
  }

  private getOrCreateSession(sessionId: string, agentType?: string): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = createSession({ id: sessionId, agentType: agentType || 'hackbot' });
      this.sessions.set(sessionId, session);
      try {
        this.hydrateSessionFromSqlite(sessionId);
      } catch {
        /* SQLite 不可用时仍用空会话 */
      }
      session = this.sessions.get(sessionId) ?? session;
    }
    return session;
  }

  private hydrateSessionFromSqlite(sessionId: string): void {
    let current = this.sessions.get(sessionId);
    if (!current) return;
    const turns = this.databaseService.getConversations({ sessionId, limit: 24 }).slice().reverse();
    for (const turn of turns) {
      if (turn.userMessage) {
        current = addSessionMessage(current, MessageRole.USER, turn.userMessage);
      }
      if (turn.assistantMessage) {
        current = addSessionMessage(current, MessageRole.ASSISTANT, turn.assistantMessage);
      }
    }
    this.sessions.set(sessionId, current);
    const latest = turns[turns.length - 1];
    const meta = parseConversationMeta(latest?.metadata);
    if (meta.paused?.originalMessage) {
      this.contextAssembler.setPausedTask(sessionId, meta.paused);
    }
  }

  private appendSessionMessage(sessionId: string, role: MessageRole, content: string): void {
    const current = this.getOrCreateSession(sessionId);
    this.sessions.set(sessionId, addSessionMessage(current, role, content));
  }

  private slimTimeline(agent?: SecurityReActAgent): SlimTimelineItem[] {
    if (!agent?.reactHistory?.length) return [];
    return agent.reactHistory.slice(-30).map((step, index) => ({
      id: `step-${index}`,
      type: step.type,
      title: step.type,
      body: step.content.slice(0, 4000),
    }));
  }

  private persistTurn(params: {
    sessionId: string;
    userMessage: string;
    assistantMessage: string;
    agentType: string;
    agent?: SecurityReActAgent;
  }): void {
    const { sessionId, userMessage, assistantMessage, agentType } = params;
    this.appendSessionMessage(sessionId, MessageRole.ASSISTANT, assistantMessage);
    try {
      const latest = this.databaseService.getLatestConversation(sessionId);
      const prev = parseConversationMeta(latest?.metadata);
      const paused = this.contextAssembler.getPausedTask(sessionId);
      const title = prev.title?.trim() || userMessage.trim().slice(0, 48);
      this.databaseService.saveConversation({
        agentType,
        userMessage,
        assistantMessage,
        sessionId,
        timestamp: new Date().toISOString(),
        metadata: stringifyConversationMeta({
          title,
          paused,
          timeline: this.slimTimeline(params.agent),
        }),
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

function resolveAgentModelName(agent: unknown): string | undefined {
  if (!agent || typeof agent !== 'object' || !('llm' in agent)) {
    return undefined;
  }

  try {
    const llm = (agent as { llm?: unknown }).llm;
    if (!llm || typeof llm !== 'object' || !('model' in llm)) {
      return undefined;
    }
    const model = (llm as { model?: unknown }).model;
    return typeof model === 'string' && model.trim() ? model : undefined;
  } catch {
    return undefined;
  }
}
