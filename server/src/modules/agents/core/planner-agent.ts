import { BaseAgent } from './base-agent';
import {
  ChatMessage,
  TodoItem,
  PlanResult,
  RequestType,
  createTodoItem,
} from '../../../common/types';
import { LLMProvider, createLLM } from '../../../common/llm';

const PLANNER_SYSTEM_PROMPT =
  '你是一个安全测试任务规划专家。你的职责是将用户的安全测试需求拆分为' +
  '可执行的子任务列表。\n\n' +
  '规划原则：\n' +
  '1. 子任务之间的依赖关系要清晰，支持并行执行的任务不要设置不必要的依赖。\n' +
  '2. 每个子任务应尽可能原子化，便于独立执行和结果评估。\n' +
  '3. toolHint 字段用于提示执行该任务应使用的工具名称。\n' +
  '4. 任务 ID 使用有意义的短标识（如 recon-1、scan-1、exploit-1）。';

interface RawTodoPlan {
  id: string;
  content: string;
  toolHint?: string;
  dependsOn?: string[];
}

export class PlannerAgent extends BaseAgent {
  private readonly llm: LLMProvider;

  constructor() {
    super('Planner', PLANNER_SYSTEM_PROMPT);
    this.llm = createLLM({
      provider: process.env.LLM_PROVIDER ?? 'ollama',
      model: process.env.LLM_MODEL,
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
    });
  }

  async process(userInput: string, _options?: Record<string, unknown>): Promise<string> {
    const result = await this.plan(userInput);
    if (result.directResponse) {
      return result.directResponse;
    }
    const todoDescriptions = result.todos
      .map((t) => `- [${t.id}] ${t.content} (工具: ${t.toolHint || '自动选择'})`)
      .join('\n');
    return `${result.planSummary}\n\n任务列表：\n${todoDescriptions}`;
  }

  async plan(userInput: string): Promise<PlanResult> {
    const prompt = this.buildPlanPrompt(userInput);

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: prompt },
    ];

    const response = await this.llm.chat(messages);
    return this.parsePlanResponse(response, userInput);
  }

  getExecutionOrder(todos: TodoItem[]): TodoItem[][] {
    const completed = new Set<string>();
    const remaining = new Map<string, TodoItem>();
    for (const todo of todos) {
      remaining.set(todo.id, todo);
    }

    const layers: TodoItem[][] = [];

    while (remaining.size > 0) {
      const currentLayer: TodoItem[] = [];

      for (const [id, todo] of remaining) {
        const depsResolved = todo.dependsOn.every(
          (dep) => completed.has(dep) || !remaining.has(dep),
        );
        if (depsResolved) {
          currentLayer.push(todo);
        }
      }

      if (currentLayer.length === 0) {
        currentLayer.push(...remaining.values());
        remaining.clear();
      } else {
        for (const todo of currentLayer) {
          remaining.delete(todo.id);
          completed.add(todo.id);
        }
      }

      layers.push(currentLayer);
    }

    return layers;
  }

  private buildPlanPrompt(userInput: string): string {
    return (
      `请将以下安全测试需求拆分为可执行的子任务列表。\n\n` +
      `用户需求：${userInput}\n\n` +
      `请严格按照以下 JSON 数组格式输出（不要包含其他文字）：\n` +
      `[\n` +
      `  {\n` +
      `    "id": "任务唯一标识，如 recon-1",\n` +
      `    "content": "任务描述",\n` +
      `    "toolHint": "推荐使用的工具名称，没有则留空字符串",\n` +
      `    "dependsOn": ["依赖的任务 ID 列表，没有则为空数组"]\n` +
      `  }\n` +
      `]\n\n` +
      `注意：\n` +
      `- 如果需求很简单或不需要工具执行（如问候、闲聊），返回空数组 []\n` +
      `- 确保输出是合法 JSON`
    );
  }

  private parsePlanResponse(response: string, userInput: string): PlanResult {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return {
        requestType: RequestType.SIMPLE,
        todos: [],
        directResponse: response,
        planSummary: '无法解析为任务列表，直接返回 LLM 回答。',
      };
    }

    try {
      const rawTodos: RawTodoPlan[] = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(rawTodos) || rawTodos.length === 0) {
        return {
          requestType: RequestType.SIMPLE,
          todos: [],
          directResponse: null,
          planSummary: '该请求无需拆分任务。',
        };
      }

      const todos: TodoItem[] = rawTodos.map((raw) =>
        createTodoItem({
          id: raw.id,
          content: raw.content,
          toolHint: raw.toolHint ?? '',
          dependsOn: raw.dependsOn ?? [],
        }),
      );

      return {
        requestType: RequestType.TECHNICAL,
        todos,
        directResponse: null,
        planSummary: `已将「${userInput}」拆分为 ${todos.length} 个子任务。`,
      };
    } catch {
      return {
        requestType: RequestType.SIMPLE,
        todos: [],
        directResponse: response,
        planSummary: 'JSON 解析失败，直接返回 LLM 回答。',
      };
    }
  }
}
