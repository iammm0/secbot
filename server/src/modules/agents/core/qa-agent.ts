import { BaseAgent } from './base-agent';
import { ChatMessage } from '../../../common/types';
import { LLMProvider, createLLM } from '../../../common/llm';

interface RuleMatch {
  patterns: RegExp[];
  response: string;
}

const RULES: RuleMatch[] = [
  {
    patterns: [/^(你好|hi|hello|嗨|hey|您好)/i],
    response:
      '你好！我是安全测试助手，有什么可以帮你的吗？你可以让我进行安全扫描、漏洞检测等操作。',
  },
  {
    patterns: [/(谢谢|感谢|thanks|thank you|thx)/i],
    response: '不客气！如果还有其他安全相关的问题，随时可以问我。',
  },
  {
    patterns: [/(再见|拜拜|bye|goodbye|回头见)/i],
    response: '再见！祝你的系统安全无虞。有需要随时回来找我。',
  },
  {
    patterns: [/(能做什么|功能|你会什么|帮助|help|有什么用)/i],
    response:
      '我是一个专业的安全测试助手，主要能力包括：\n\n' +
      '1. **网络扫描** — 端口扫描、服务识别、主机发现\n' +
      '2. **漏洞检测** — Web 应用漏洞扫描、已知 CVE 检测\n' +
      '3. **渗透测试** — 自动化渗透流程、漏洞验证\n' +
      '4. **安全评估** — 风险评级、安全建议、报告生成\n' +
      '5. **防御建议** — 安全加固方案、最佳实践推荐\n\n' +
      '你可以直接告诉我目标，例如："扫描 192.168.1.1 的开放端口"。',
  },
  {
    patterns: [/(天气|weather)/i],
    response:
      '抱歉，我是安全测试专用助手，无法查询天气信息。不过我可以帮你检测目标系统的"安全天气"——看看有没有漏洞风暴来袭！',
  },
];

const QA_SYSTEM_PROMPT =
  '你是一个专业的网络安全问答助手，工作风格为执行优先。\n' +
  '必须优先参考已注入上下文再回答，避免重复提问已知信息。\n' +
  '回答结构：结论 -> 依据 -> 下一步建议；尽量给可直接执行的建议。\n' +
  '若上下文不足以得出可靠结论，请明确说明缺口并提出最少必要追问。\n' +
  '始终使用中文。';

export class QAAgent extends BaseAgent {
  private readonly llm: LLMProvider;

  constructor() {
    super('QA', QA_SYSTEM_PROMPT);
    this.llm = createLLM({
      provider: process.env.LLM_PROVIDER ?? 'ollama',
      model: process.env.LLM_MODEL,
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
    });
  }

  async process(userInput: string, options?: Record<string, unknown>): Promise<string> {
    const context = options?.context as string | undefined;
    return this.answer(userInput, context);
  }

  async answer(userInput: string, context?: string): Promise<string> {
    const ruleResponse = this.matchRule(userInput);
    if (ruleResponse) {
      return ruleResponse;
    }

    const messages: ChatMessage[] = [{ role: 'system', content: this.systemPrompt }];

    if (context) {
      messages.push({
        role: 'system',
        content: `参考上下文：\n${context}`,
      });
    }

    messages.push({ role: 'user', content: userInput });

    return this.llm.chat(messages);
  }

  async answerWithContext(
    userInput: string,
    conversationHistory: ChatMessage[],
    contextBlock?: string,
  ): Promise<string> {
    const ruleResponse = this.matchRule(userInput);
    if (ruleResponse) {
      return ruleResponse;
    }

    const recentHistory = conversationHistory.slice(-20);

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...(contextBlock
        ? [{ role: 'system' as const, content: `已注入上下文（优先参考）：\n${contextBlock}` }]
        : []),
      ...recentHistory,
      { role: 'user', content: userInput },
    ];

    return this.llm.chat(messages);
  }

  private matchRule(input: string): string | null {
    const trimmed = input.trim();
    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(trimmed)) {
          return rule.response;
        }
      }
    }
    return null;
  }
}
