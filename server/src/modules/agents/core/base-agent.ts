export interface AgentMessage {
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export abstract class BaseAgent {
  readonly name: string;
  protected systemPrompt: string;
  protected conversationHistory: AgentMessage[] = [];

  constructor(name: string, systemPrompt?: string) {
    this.name = name;
    this.systemPrompt = systemPrompt ?? this.defaultSystemPrompt();
  }

  abstract process(
    userInput: string,
    options?: Record<string, unknown>,
  ): Promise<string>;

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
      '你是一个专业的网络安全助手，具备渗透测试、漏洞分析、' +
      '安全评估和防御策略方面的专业知识。请用中文回答问题，' +
      '并在合法授权的范围内提供安全建议。'
    );
  }
}
