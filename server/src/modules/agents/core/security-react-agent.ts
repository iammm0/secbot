import { BaseAgent, AgentMessage } from './base-agent';
import { BaseTool, ToolResult } from '../../tools/core/base-tool';
import { EventBus, EventType, BusEvent } from '../../../common/event-bus';
import { ChatMessage } from '../../../common/types';
import { LLMProvider, createLLM, LLMConfig } from '../../../common/llm';
import { TodoItem } from '../../../common/types';

interface ReActStep {
  type: 'thought' | 'action' | 'observation';
  content: string;
  iteration: number;
}

interface ParsedAction {
  tool: string;
  params: Record<string, unknown>;
}

type OnEventCallback = (event: BusEvent) => void;

export class SecurityReActAgent extends BaseAgent {
  private readonly toolsDict: Map<string, BaseTool>;
  private readonly tools: BaseTool[];
  private readonly autoExecute: boolean;
  private readonly maxIterations: number;
  private readonly llm: LLMProvider;
  private _reactHistory: ReActStep[] = [];

  constructor(
    name: string,
    systemPrompt: string,
    tools: BaseTool[],
    autoExecute = true,
    maxIterations = 10,
  ) {
    super(name, systemPrompt);
    this.tools = tools;
    this.autoExecute = autoExecute;
    this.maxIterations = maxIterations;

    this.toolsDict = new Map<string, BaseTool>();
    for (const tool of tools) {
      this.toolsDict.set(tool.name, tool);
    }

    this.llm = createLLM({
      provider: process.env.LLM_PROVIDER ?? 'ollama',
      model: process.env.LLM_MODEL,
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
    });
  }

  get reactHistory(): ReadonlyArray<ReActStep> {
    return this._reactHistory;
  }

  async process(userInput: string, options?: Record<string, unknown>): Promise<string> {
    const onEvent = options?.onEvent as OnEventCallback | undefined;

    this._reactHistory = [];
    this.addMessage('user', userInput);

    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemMessage() },
      ...this.getConversationHistory().map(
        (m: AgentMessage): ChatMessage => ({
          role: m.role as ChatMessage['role'],
          content: m.content,
        }),
      ),
    ];

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      onEvent?.({
        type: EventType.THINK_START,
        data: { agent: this.name, iteration },
        timestamp: new Date(),
        iteration,
      });

      const thought = await this.llm.chat(messages);

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

      const action = this.parseAction(thought);

      if (!action) {
        const finalAnswer = this.extractFinalAnswer(thought);
        const response = finalAnswer ?? thought;
        this.addMessage('assistant', response);
        return response;
      }

      this._reactHistory.push({
        type: 'action',
        content: JSON.stringify(action),
        iteration,
      });

      if (!this.autoExecute) {
        const response = `需要执行工具: ${action.tool}\n参数: ${JSON.stringify(action.params, null, 2)}`;
        this.addMessage('assistant', response);
        return response;
      }

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

      const result = await this.executeTool(action.tool, action.params);
      const observation = this.formatObservation(result);

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

  parseAction(thought: string): ParsedAction | null {
    if (/Final\s*Answer\s*:/i.test(thought)) {
      return null;
    }

    const actionMatch = thought.match(/Action\s*:\s*(\{[\s\S]*?\})\s*(?:\n|$)/);
    if (!actionMatch) {
      return null;
    }

    try {
      const parsed = JSON.parse(actionMatch[1]);
      if (typeof parsed.tool === 'string' && parsed.params !== undefined) {
        return {
          tool: parsed.tool,
          params: parsed.params as Record<string, unknown>,
        };
      }
    } catch {
      /* malformed JSON — treat as no action */
    }

    return null;
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.toolsDict.get(toolName);
    if (!tool) {
      return {
        success: false,
        result: null,
        error: `未找到工具: ${toolName}，可用工具: ${[...this.toolsDict.keys()].join(', ')}`,
      };
    }

    try {
      return await tool.run(params);
    } catch (err) {
      return {
        success: false,
        result: null,
        error: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  formatObservation(result: ToolResult): string {
    if (!result.success) {
      return `[错误] ${result.error ?? '未知错误'}`;
    }

    if (typeof result.result === 'string') {
      return result.result;
    }

    return JSON.stringify(result.result, null, 2);
  }

  getToolsDescription(): string {
    return this.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  }

  async executeTodo(
    todo: TodoItem,
    userInput: string,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const onEvent = options?.onEvent as OnEventCallback | undefined;

    const prompt =
      `针对以下子任务，选择合适的工具并执行。\n\n` +
      `原始需求: ${userInput}\n` +
      `当前子任务: ${todo.content}\n` +
      `工具提示: ${todo.toolHint || '自动选择'}\n\n` +
      `可用工具:\n${this.getToolsDescription()}\n\n` +
      `请使用以下格式回答:\n` +
      `Thought: 分析该子任务需要使用的工具和参数\n` +
      `Action: {"tool": "工具名称", "params": {"参数名": "参数值"}}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemMessage() },
      { role: 'user', content: prompt },
    ];

    onEvent?.({
      type: EventType.THINK_START,
      data: { agent: this.name, todoId: todo.id, task: todo.content },
      timestamp: new Date(),
      iteration: 0,
    });

    const thought = await this.llm.chat(messages);

    onEvent?.({
      type: EventType.THINK_END,
      data: { agent: this.name, todoId: todo.id, thought },
      timestamp: new Date(),
      iteration: 0,
    });

    const action = this.parseAction(thought);
    if (!action) {
      const finalAnswer = this.extractFinalAnswer(thought) ?? thought;
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

    const result = await this.executeTool(action.tool, action.params);

    onEvent?.({
      type: EventType.EXEC_RESULT,
      data: {
        agent: this.name,
        todoId: todo.id,
        tool: action.tool,
        success: result.success,
        observation: this.formatObservation(result),
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

  private extractFinalAnswer(thought: string): string | null {
    const match = thought.match(/Final\s*Answer\s*:\s*([\s\S]*)/i);
    return match ? match[1].trim() : null;
  }

  private buildSystemMessage(): string {
    return (
      `${this.systemPrompt}\n\n` +
      `你是一个ReAct (Reasoning + Acting) 安全测试代理。` +
      `请使用 Think -> Action -> Observation 循环来完成任务。\n\n` +
      `可用工具:\n${this.getToolsDescription()}\n\n` +
      `回答格式:\n` +
      `当你需要使用工具时:\n` +
      `Thought: 我需要...\n` +
      `Action: {"tool": "tool_name", "params": {"key": "value"}}\n\n` +
      `当你已经得出最终答案时:\n` +
      `Thought: 我已经获得了足够的信息。\n` +
      `Final Answer: 你的最终回答内容`
    );
  }
}
