import { BaseTool } from '../../tools/core/base-tool';

export interface AgentMessage {
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export abstract class BaseAgent {
  readonly name: string;
  protected systemPrompt: string;
  protected conversationHistory: AgentMessage[] = [];
  protected readonly tools: BaseTool[];
  protected readonly toolsDict: Map<string, BaseTool>;

  constructor(name: string, systemPrompt?: string, tools: BaseTool[] = []) {
    this.name = name;
    this.systemPrompt = systemPrompt ?? this.defaultSystemPrompt();
    this.tools = tools;
    this.toolsDict = new Map<string, BaseTool>();
    for (const tool of tools) {
      this.toolsDict.set(tool.name, tool);
    }
  }

  abstract process(userInput: string, options?: Record<string, unknown>): Promise<string>;

  getToolsDescription(): string {
    return this.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  }

  addMessage(role: string, content: string, metadata?: Record<string, unknown>): void {
    this.conversationHistory.push({ role, content, metadata });
  }

  getConversationHistory(limit?: number): AgentMessage[] {
    if (limit === undefined) {
      return [...this.conversationHistory];
    }
    return this.conversationHistory.slice(-limit);
  }

  clearMemory(): void {
    this.conversationHistory = [];
  }

  updateSystemPrompt(newPrompt: string): void {
    this.systemPrompt = newPrompt;
  }

  protected defaultSystemPrompt(): string {
    return (
      '你是 SecBot —— 一个全栈网络安全助手，具备渗透测试、漏洞分析、' +
      '代码审计、云安全、容器安全、协议安全和防御策略方面的专业知识。\n' +
      '请用中文回答问题，并在合法授权的范围内提供安全建议。\n' +
      '优先给出可直接执行的操作步骤和工具调用建议。'
    );
  }
}
