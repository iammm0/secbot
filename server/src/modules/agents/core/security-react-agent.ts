import { BaseAgent, AgentMessage } from './base-agent';
import { BaseTool, ToolProgressCallback, ToolResult } from '../../tools/core/base-tool';
import { EventType, BusEvent } from '../../../common/event-bus';
import { ChatMessage } from '../../../common/types';
import { LLMProvider, createLLM } from '../../../common/llm';
import { TodoItem } from '../../../common/types';
import { validateToolInvocation } from './tool-action-validate';
import { formatExecuteCommandObservation, truncateMiddleText } from './observation-format';
import { type ClientShellPayload, formatClientShellContextBlock } from './client-shell-context.js';
import {
  extractFinalAnswer,
  hasFinalAnswer,
  parseToolAction,
  type ParsedAction,
} from './parse-tool-action';
import { throwIfAborted, TaskPausedError } from '../../chat/paused-task';
import { traceToolRun } from '../../chat/workflow-trace';
import {
  createHumanRequest,
  isAlwaysAllowed,
  markAlwaysAllow,
  type ConfirmAction,
  type UserInputPayload,
} from '../../chat/human-input-bridge';
import {
  createJevClient,
  JEV_REACT_STOP_NUDGE,
  shouldNudgeReactStop,
  type JevClient,
} from '../../../common/jev';

interface ReActStep {
  type: 'thought' | 'action' | 'observation';
  content: string;
  iteration: number;
}

type OnEventCallback = (event: BusEvent) => void;

export const REACT_OPERATING_POLICY =
  '【工作模式】执行优先：在具备授权前提下优先给出可落地步骤、命令和工具调用；' +
  '若缺关键参数，先提出最少澄清问题再继续。\n' +
  '【上下文约束】必须优先使用已提供的 RecentSession / SQLiteHistory / VectorMemory；' +
  '不得忽略上下文重复询问已知信息。\n' +
  '【安全边界】禁止无授权的破坏性/越权攻击；涉及高风险命令时先说明影响并给出确认建议。\n' +
  '【自动安装】当工具返回"未安装"/"not found"/"ENOENT"错误时，' +
  '立即调用 install_tool 安装对应工具，安装成功后重试原操作，无需询问用户。\n' +
  '【关键决策】长任务中若出现需要用户拍板的方向性问题（范围取舍、是否继续利用、优先测哪条链路等），' +
  '必须调用 ask_user 工具给出单选/多选/可自由描述的选项，等待用户回答后再继续，禁止擅自替用户做关键决策。\n' +
  '【输出要求】每轮给出：当前结论、依据证据、下一步动作。';

const ASK_USER_TOOL = 'ask_user';

export class SecurityReActAgent extends BaseAgent {
  /** Hack 模式：敏感工具需用户批准；SuperHack：false，直接执行 */
  private readonly requireSensitiveApproval: boolean;
  private readonly maxIterations: number;
  private _reactHistory: ReActStep[] = [];
  private _jevStopNudged = false;
  private readonly _jev?: JevClient;

  get llm(): LLMProvider {
    return createLLM();
  }

  constructor(
    name: string,
    systemPrompt: string,
    tools: BaseTool[],
    requireSensitiveApproval = true,
    maxIterations = Infinity,
    jev?: JevClient,
  ) {
    super(name, systemPrompt, tools);
    this.requireSensitiveApproval = requireSensitiveApproval;
    this.maxIterations = maxIterations;
    this._jev = jev;
  }

  get reactHistory(): ReadonlyArray<ReActStep> {
    return this._reactHistory;
  }

  async process(userInput: string, options?: Record<string, unknown>): Promise<string> {
    const onEvent = options?.onEvent as OnEventCallback | undefined;
    const abortSignal = options?.abortSignal as AbortSignal | undefined;
    const sessionId = String(options?.sessionId ?? '');

    this._reactHistory = [];
    this._jevStopNudged = false;
    this.addMessage('user', userInput);

    const clientShell = options?.client_shell as ClientShellPayload | undefined;
    const contextBlock = options?.contextBlock as string | undefined;
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemMessage(clientShell, contextBlock) },
      ...this.getConversationHistory().map(
        (m: AgentMessage): ChatMessage => ({
          role: m.role as ChatMessage['role'],
          content: m.content,
        }),
      ),
    ];

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      throwIfAborted(abortSignal, {
        progressNote: this._reactHistory
          .slice(-6)
          .map((step) => step.content)
          .join('\n')
          .slice(0, 4000),
      });

      onEvent?.({
        type: EventType.THINK_START,
        data: { agent: this.name, iteration },
        timestamp: new Date(),
        iteration,
      });

      const thought = await this.llm.chat(messages);
      throwIfAborted(abortSignal, { progressNote: thought.slice(0, 4000) });

      this._reactHistory.push({
        type: 'thought',
        content: thought,
        iteration,
      });

      onEvent?.({
        type: EventType.THINK_END,
        data: { agent: this.name, iteration, thought },
        timestamp: new Date(),
        iteration,
      });

      const action = parseToolAction(thought);

      if (!action) {
        if (hasFinalAnswer(thought)) {
          const finalAnswer = extractFinalAnswer(thought) ?? thought;
          this.addMessage('assistant', finalAnswer);
          return finalAnswer;
        }
        if (iteration < this.maxIterations) {
          messages.push({ role: 'assistant', content: thought });
          messages.push({
            role: 'user',
            content:
              '上一轮回复既未解析到 `Action:` 也未声明 `Final Answer:`。请严格按以下两种格式之一回复：\n' +
              '1) 需要调用工具：\n' +
              '   Thought: <一句话原因>\n' +
              '   Action: {"tool":"<tool_name>","params":{...}}\n' +
              '2) 已经得到结论：\n' +
              '   Thought: <一句话原因>\n' +
              '   Final Answer: <最终结论>\n' +
              '不要使用 ```json 代码块包裹 Action JSON；params 必须是对象。',
          });
          continue;
        }
        this.addMessage('assistant', thought);
        return thought;
      }

      this._reactHistory.push({
        type: 'action',
        content: JSON.stringify(action),
        iteration,
      });

      onEvent?.({
        type: EventType.EXEC_START,
        data: {
          agent: this.name,
          iteration,
          tool: action.tool,
          params: action.params,
        },
        timestamp: new Date(),
        iteration,
      });

      throwIfAborted(abortSignal, { progressNote: `即将调用工具：${action.tool}` });

      if (action.tool === ASK_USER_TOOL) {
        const observation = await this.runAskUser(action.params, {
          onEvent,
          abortSignal,
          sessionId,
          iteration,
        });
        this._reactHistory.push({ type: 'observation', content: observation, iteration });
        onEvent?.({
          type: EventType.EXEC_RESULT,
          data: {
            agent: this.name,
            iteration,
            tool: action.tool,
            success: true,
            observation,
          },
          timestamp: new Date(),
          iteration,
        });
        messages.push({ role: 'assistant', content: thought });
        messages.push({ role: 'user', content: `Observation: ${observation}` });
        continue;
      }

      const paramErr = validateToolInvocation(action.tool, action.params);
      if (paramErr) {
        const observation = `[参数错误] ${paramErr}`;
        this._reactHistory.push({
          type: 'observation',
          content: observation,
          iteration,
        });
        onEvent?.({
          type: EventType.EXEC_RESULT,
          data: {
            agent: this.name,
            iteration,
            tool: action.tool,
            success: false,
            observation,
          },
          timestamp: new Date(),
          iteration,
        });
        messages.push({ role: 'assistant', content: thought });
        messages.push({ role: 'user', content: `Observation: ${observation}` });
        continue;
      }

      const gated = await this.maybeAwaitSensitiveApproval(action, {
        onEvent,
        abortSignal,
        sessionId,
        iteration,
      });
      if (gated.denied) {
        const observation = gated.observation;
        this._reactHistory.push({ type: 'observation', content: observation, iteration });
        onEvent?.({
          type: EventType.EXEC_RESULT,
          data: {
            agent: this.name,
            iteration,
            tool: action.tool,
            success: false,
            observation,
          },
          timestamp: new Date(),
          iteration,
        });
        messages.push({ role: 'assistant', content: thought });
        messages.push({ role: 'user', content: `Observation: ${observation}` });
        continue;
      }

      const result = await this.executeTool(action.tool, action.params, (progress) => {
        onEvent?.({
          type: EventType.EXEC_PROGRESS,
          data: {
            agent: this.name,
            iteration,
            tool: action.tool,
            params: action.params,
            ...progress,
          },
          timestamp: new Date(),
          iteration,
        });
      });
      const observation = this.formatObservation(result, action.tool);

      this._reactHistory.push({
        type: 'observation',
        content: observation,
        iteration,
      });

      onEvent?.({
        type: EventType.EXEC_RESULT,
        data: {
          agent: this.name,
          iteration,
          tool: action.tool,
          success: result.success,
          observation,
        },
        timestamp: new Date(),
        iteration,
      });

      messages.push({ role: 'assistant', content: thought });
      messages.push({
        role: 'user',
        content: `Observation: ${observation}`,
      });

      if (
        result.success &&
        !this._jevStopNudged &&
        (await shouldNudgeReactStop(
          { userGoal: userInput, observation, tool: action.tool },
          this._jev ?? createJevClient(),
        ))
      ) {
        this._jevStopNudged = true;
        messages.push({ role: 'user', content: JEV_REACT_STOP_NUDGE });
      }
    }

    const fallback =
      `已达到最大迭代次数 (${this.maxIterations})，以下是目前的分析结果：\n\n` +
      this._reactHistory
        .filter((s) => s.type === 'observation')
        .map((s) => s.content)
        .join('\n\n');
    this.addMessage('assistant', fallback);
    return fallback;
  }

  /** 兼容旧 import；内部直接走共享 parseToolAction，统一处理代码块/粗体/嵌套花括号等变体 */
  parseAction(thought: string): ParsedAction | null {
    return parseToolAction(thought);
  }

  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    onProgress?: ToolProgressCallback,
  ): Promise<ToolResult> {
    const tool = this.toolsDict.get(toolName);
    if (!tool) {
      return {
        success: false,
        result: null,
        error: `未找到工具: ${toolName}，可用工具: ${[...this.toolsDict.keys()].join(', ')}`,
      };
    }

    try {
      return await traceToolRun(toolName, () => tool.run(params, onProgress), params);
    } catch (err) {
      return {
        success: false,
        result: null,
        error: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  formatObservation(result: ToolResult, toolName?: string): string {
    if (!result.success) {
      if (
        toolName === 'execute_command' &&
        result.result &&
        typeof result.result === 'object' &&
        !Array.isArray(result.result)
      ) {
        const cmd = String((result.result as Record<string, unknown>).command ?? '');
        if (cmd) {
          return `[错误] 命令: ${cmd}\n${result.error ?? '未知错误'}`;
        }
      }
      return `[错误] ${result.error ?? '未知错误'}`;
    }

    if (toolName === 'execute_command' && result.result && typeof result.result === 'object') {
      return formatExecuteCommandObservation(result.result as Record<string, unknown>);
    }

    if (typeof result.result === 'string') {
      return truncateMiddleText(result.result, 12_000, 3_500, 3_500);
    }

    try {
      return truncateMiddleText(JSON.stringify(result.result, null, 2), 12_000, 3_500, 3_500);
    } catch {
      return truncateMiddleText(String(result.result), 12_000, 3_500, 3_500);
    }
  }

  async executeTodo(
    todo: TodoItem,
    userInput: string,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const onEvent = options?.onEvent as OnEventCallback | undefined;
    const abortSignal = options?.abortSignal as AbortSignal | undefined;
    const sessionId = String(options?.sessionId ?? '');
    throwIfAborted(abortSignal, { progressNote: `准备执行子任务：${todo.content}` });

    const prompt =
      `针对以下子任务，选择合适的工具并执行。\n\n` +
      `原始需求: ${userInput}\n` +
      `当前子任务: ${todo.content}\n` +
      `工具提示: ${todo.toolHint || '自动选择'}\n\n` +
      `可用工具:\n${this.getToolsDescription()}\n\n` +
      `请使用以下格式回答:\n` +
      `Thought: 分析该子任务需要使用的工具和参数\n` +
      `Action: {"tool": "工具名称", "params": {"参数名": "参数值"}}\n` +
      `（禁止省略 params 或留空对象，除非工具为 system_info / network_analyze；` +
      `execute_command 必须提供 command。若需用户拍板请用 ask_user。）`;

    const clientShell = options?.client_shell as ClientShellPayload | undefined;
    const contextBlock = options?.contextBlock as string | undefined;
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemMessage(clientShell, contextBlock) },
      { role: 'user', content: prompt },
    ];

    onEvent?.({
      type: EventType.THINK_START,
      data: { agent: this.name, todoId: todo.id, task: todo.content },
      timestamp: new Date(),
      iteration: 0,
    });

    const thought = await this.llm.chat(messages);
    throwIfAborted(abortSignal, { progressNote: thought.slice(0, 4000) });

    onEvent?.({
      type: EventType.THINK_END,
      data: { agent: this.name, todoId: todo.id, thought },
      timestamp: new Date(),
      iteration: 0,
    });

    const action = parseToolAction(thought);
    if (!action) {
      const finalAnswer = extractFinalAnswer(thought) ?? thought;
      return { todoId: todo.id, success: true, result: finalAnswer };
    }

    onEvent?.({
      type: EventType.EXEC_START,
      data: {
        agent: this.name,
        todoId: todo.id,
        tool: action.tool,
        params: action.params,
      },
      timestamp: new Date(),
      iteration: 0,
    });

    if (action.tool === ASK_USER_TOOL) {
      const observation = await this.runAskUser(action.params, {
        onEvent,
        abortSignal,
        sessionId,
        iteration: 0,
        todoId: todo.id,
      });
      onEvent?.({
        type: EventType.EXEC_RESULT,
        data: {
          agent: this.name,
          todoId: todo.id,
          tool: action.tool,
          success: true,
          observation,
        },
        timestamp: new Date(),
        iteration: 0,
      });
      return { todoId: todo.id, success: true, result: observation, tool: ASK_USER_TOOL };
    }

    const paramErr = validateToolInvocation(action.tool, action.params);
    if (paramErr) {
      const observation = `[参数错误] ${paramErr}`;
      onEvent?.({
        type: EventType.EXEC_RESULT,
        data: {
          agent: this.name,
          todoId: todo.id,
          tool: action.tool,
          success: false,
          observation,
        },
        timestamp: new Date(),
        iteration: 0,
      });
      return { todoId: todo.id, success: false, error: paramErr };
    }

    throwIfAborted(abortSignal, { progressNote: `即将调用工具：${action.tool}` });

    const gated = await this.maybeAwaitSensitiveApproval(action, {
      onEvent,
      abortSignal,
      sessionId,
      iteration: 0,
      todoId: todo.id,
    });
    if (gated.denied) {
      onEvent?.({
        type: EventType.EXEC_RESULT,
        data: {
          agent: this.name,
          todoId: todo.id,
          tool: action.tool,
          success: false,
          observation: gated.observation,
        },
        timestamp: new Date(),
        iteration: 0,
      });
      return { todoId: todo.id, success: false, error: gated.observation, tool: action.tool };
    }

    const result = await this.executeTool(action.tool, action.params, (progress) => {
      onEvent?.({
        type: EventType.EXEC_PROGRESS,
        data: {
          agent: this.name,
          todoId: todo.id,
          tool: action.tool,
          params: action.params,
          ...progress,
        },
        timestamp: new Date(),
        iteration: 0,
      });
    });

    onEvent?.({
      type: EventType.EXEC_RESULT,
      data: {
        agent: this.name,
        todoId: todo.id,
        tool: action.tool,
        success: result.success,
        observation: this.formatObservation(result, action.tool),
      },
      timestamp: new Date(),
      iteration: 0,
    });

    return {
      todoId: todo.id,
      tool: action.tool,
      success: result.success,
      result: result.result,
      error: result.error,
    };
  }

  private async maybeAwaitSensitiveApproval(
    action: ParsedAction,
    ctx: {
      onEvent?: OnEventCallback;
      abortSignal?: AbortSignal;
      sessionId: string;
      iteration: number;
      todoId?: string;
    },
  ): Promise<{ denied: boolean; observation: string }> {
    const tool = this.toolsDict.get(action.tool);
    if (!tool?.sensitive) return { denied: false, observation: '' };
    if (!this.requireSensitiveApproval) return { denied: false, observation: '' };
    if (ctx.sessionId && isAlwaysAllowed(ctx.sessionId, action.tool)) {
      return { denied: false, observation: '' };
    }

    const { requestId, promise } = createHumanRequest<{ action: ConfirmAction }>({
      sessionId: ctx.sessionId || 'anonymous',
      kind: 'confirm',
    });

    ctx.onEvent?.({
      type: EventType.CONFIRM_REQUIRED,
      data: {
        request_id: requestId,
        kind: 'sensitive_tool',
        tool: action.tool,
        params: action.params,
        risk_summary: tool.description,
        session_id: ctx.sessionId,
        todoId: ctx.todoId,
      },
      timestamp: new Date(),
      iteration: ctx.iteration,
    });

    const result = await this.awaitWithHeartbeat(promise, ctx, '等待批准敏感操作…');
    if (result.action === 'deny') {
      return {
        denied: true,
        observation: `[用户拒绝] 敏感工具 ${action.tool} 未获批准，请换用不敏感手段或结束相关步骤。`,
      };
    }
    if (result.action === 'always_allow' && ctx.sessionId) {
      markAlwaysAllow(ctx.sessionId, action.tool);
    }
    return { denied: false, observation: '' };
  }

  private async runAskUser(
    params: Record<string, unknown>,
    ctx: {
      onEvent?: OnEventCallback;
      abortSignal?: AbortSignal;
      sessionId: string;
      iteration: number;
      todoId?: string;
    },
  ): Promise<string> {
    const prompt = String(params.prompt ?? params.question ?? '请确认下一步方向').trim();
    const inputTypeRaw = String(params.input_type ?? params.inputType ?? 'single_select').trim();
    const inputType =
      inputTypeRaw === 'multi_select' || inputTypeRaw === 'text' ? inputTypeRaw : 'single_select';
    const allowFreeText = Boolean(
      params.allow_free_text ?? params.allowFreeText ?? inputType === 'text',
    );
    const optionsRaw = Array.isArray(params.options) ? params.options : [];
    const options = optionsRaw
      .map((item, index) => {
        if (typeof item === 'string') return { id: `opt-${index}`, label: item };
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const id = String(rec.id ?? `opt-${index}`);
          const label = String(rec.label ?? rec.text ?? id);
          return { id, label };
        }
        return null;
      })
      .filter((item): item is { id: string; label: string } => Boolean(item));

    const { requestId, promise } = createHumanRequest<UserInputPayload>({
      sessionId: ctx.sessionId || 'anonymous',
      kind: 'user_input',
    });

    ctx.onEvent?.({
      type: EventType.USER_INPUT_REQUIRED,
      data: {
        request_id: requestId,
        prompt,
        input_type: inputType,
        options,
        allow_free_text: allowFreeText,
        session_id: ctx.sessionId,
        todoId: ctx.todoId,
      },
      timestamp: new Date(),
      iteration: ctx.iteration,
    });

    const answer = await this.awaitWithHeartbeat(promise, ctx, '等待用户决策…');
    const selected = Array.isArray(answer.selected)
      ? answer.selected.filter((x): x is string => typeof x === 'string')
      : [];
    const text = typeof answer.text === 'string' ? answer.text.trim() : '';
    const selectedLabels = selected.map((id) => options.find((o) => o.id === id)?.label ?? id);
    const parts = [
      selectedLabels.length > 0 ? `选项: ${selectedLabels.join('、')}` : '',
      text ? `补充: ${text}` : '',
    ].filter(Boolean);
    return parts.length > 0 ? `[用户决策] ${parts.join('；')}` : '[用户决策] （空）';
  }

  private async awaitWithHeartbeat<T>(
    promise: Promise<T>,
    ctx: {
      onEvent?: OnEventCallback;
      abortSignal?: AbortSignal;
      iteration: number;
      todoId?: string;
    },
    detail: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const emitAwaiting = () => {
        ctx.onEvent?.({
          type: EventType.TASK_PHASE,
          data: { phase: 'awaiting_user', detail },
          timestamp: new Date(),
          iteration: ctx.iteration,
        });
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        clearInterval(beat);
        reject(new TaskPausedError({ progressNote: detail }));
      };
      if (ctx.abortSignal?.aborted) {
        onAbort();
        return;
      }
      ctx.abortSignal?.addEventListener('abort', onAbort, { once: true });

      // Immediate phase so the client flushes UI / stall timers right after
      // confirm_required / user_input_required (don't wait for the first interval).
      emitAwaiting();
      const beat = setInterval(emitAwaiting, 8_000);

      promise
        .then((value) => {
          if (settled) return;
          settled = true;
          clearInterval(beat);
          ctx.abortSignal?.removeEventListener('abort', onAbort);
          resolve(value);
        })
        .catch((err) => {
          if (settled) return;
          settled = true;
          clearInterval(beat);
          ctx.abortSignal?.removeEventListener('abort', onAbort);
          reject(err);
        });
    });
  }

  private buildSystemMessage(clientShell?: ClientShellPayload, contextBlock?: string): string {
    const shellBlock = formatClientShellContextBlock(clientShell);
    const modelInfo = this.llm.model ? `当前推理模型: ${this.llm.model}\n\n` : '';
    const approvalNote = this.requireSensitiveApproval
      ? '当前为 Hack 模式：敏感工具执行前会请求用户批准。\n'
      : '当前为 SuperHack 模式：敏感工具可直接执行，无需逐步批准。\n';
    return (
      `${this.systemPrompt}\n\n` +
      modelInfo +
      approvalNote +
      `${REACT_OPERATING_POLICY}\n\n` +
      (contextBlock ? `【已注入上下文】\n${contextBlock}\n\n` : '') +
      (shellBlock ? `${shellBlock}\n\n` : '') +
      `你是一个ReAct (Reasoning + Acting) 安全测试代理。` +
      `请使用 Think -> Action -> Observation 循环来完成任务。\n\n` +
      `可用工具:\n${this.getToolsDescription()}\n` +
      `- ask_user: 向用户征求关键决策。params: {` +
      `"prompt":"问题","input_type":"single_select|multi_select|text",` +
      `"options":[{"id":"a","label":"..."}],"allow_free_text":true}\n\n` +
      `回答格式:\n` +
      `当你需要使用工具时:\n` +
      `Thought: 我需要...\n` +
      `Action: {"tool": "tool_name", "params": {"key": "value"}}\n` +
      `（params 必须是含至少一个有效字段的对象；` +
      `execute_command 必须含非空字符串 "command"；` +
      `仅 system_info / network_analyze 允许无参或空对象。）\n\n` +
      `当你已经得出最终答案时:\n` +
      `Thought: 我已经获得了足够的信息。\n` +
      `Final Answer: 你的最终回答内容`
    );
  }
}
