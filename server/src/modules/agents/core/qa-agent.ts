import { BaseAgent } from './base-agent';
import { ChatMessage } from '../../../common/types';
import { LLMProvider, createLLM } from '../../../common/llm';
import { SmartSearchTool } from '../../tools/web-research/smart-search.tool';
import { CveLookupTool } from '../../tools/utility/cve-lookup.tool';

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

const LIVE_QA_SYSTEM_PROMPT =
  '你正在回答需要时效性的安全问题。\n' +
  '必须优先依据“实时检索结果”作答，而不是依赖过期常识。\n' +
  '如果实时检索失败、结果不足或来源互相矛盾，必须明确说明不确定性。\n' +
  '回答结构：结论 -> 依据 -> 下一步建议。\n' +
  '如检索结果包含来源链接，请在答案中保留关键来源。';

const LIVE_RECENCY_HINTS = [
  '最新',
  '最近',
  '近期',
  '今天',
  '当前',
  '实时',
  'newest',
  'latest',
  'recent',
  'current',
  'today',
  'trending',
];

const LIVE_SECURITY_HINTS = [
  '零日',
  '0day',
  'zero-day',
  '漏洞',
  'cve',
  'exploit',
  '高危',
  '安全新闻',
  '威胁情报',
  '安全通告',
  '漏洞情况',
];

const CVE_ID_PATTERN = /\bcve-\d{4}-\d{4,7}\b/i;

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function extractCveId(input: string): string | null {
  const match = input.match(CVE_ID_PATTERN);
  return match ? match[0].toUpperCase() : null;
}

export function isLiveSecurityQuery(input: string): boolean {
  const lower = input.toLowerCase();
  return includesAny(lower, LIVE_RECENCY_HINTS) && includesAny(lower, LIVE_SECURITY_HINTS);
}

type SmartSearchResult = {
  query?: string;
  total?: number;
  ai_summary?: string;
  results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    page_content?: string;
  }>;
};

type CveLookupResult = {
  cve_id?: string;
  description?: string;
  cvss?: {
    score?: unknown;
    severity?: unknown;
    vector?: unknown;
  } | null;
  affected_products?: Array<{
    vendor?: unknown;
    product?: unknown;
    versions?: unknown[];
  }>;
  references?: unknown[];
  state?: unknown;
  date_published?: unknown;
};

export class QAAgent extends BaseAgent {
  private readonly llm: LLMProvider;
  private smartSearchTool: Pick<SmartSearchTool, 'run'>;
  private cveLookupTool: Pick<CveLookupTool, 'run'>;

  constructor() {
    super('QA', QA_SYSTEM_PROMPT);
    this.llm = createLLM();
    this.smartSearchTool = new SmartSearchTool();
    this.cveLookupTool = new CveLookupTool();
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

  async answerAdaptive(
    userInput: string,
    conversationHistory: ChatMessage[],
    contextBlock?: string,
  ): Promise<string> {
    const ruleResponse = this.matchRule(userInput);
    if (ruleResponse) {
      return ruleResponse;
    }

    const cveId = extractCveId(userInput);
    if (cveId) {
      return this.answerSpecificCve(userInput, conversationHistory, contextBlock, cveId);
    }

    if (isLiveSecurityQuery(userInput)) {
      return this.answerLatestSecurityQuery(userInput, conversationHistory, contextBlock);
    }

    return this.answerWithContext(userInput, conversationHistory, contextBlock);
  }

  private async answerSpecificCve(
    userInput: string,
    conversationHistory: ChatMessage[],
    contextBlock: string | undefined,
    cveId: string,
  ): Promise<string> {
    const result = await this.cveLookupTool.run({ cve_id: cveId });
    if (!result.success || !result.result) {
      return `暂时无法实时获取 ${cveId} 的详情：${result.error ?? '未知错误'}。请稍后重试，或确认 CVE 编号是否正确。`;
    }
    const retrievalContext = this.formatCveLookupResult(result.result);
    return this.answerWithRetrievedContext(
      userInput,
      conversationHistory,
      contextBlock,
      retrievalContext,
    );
  }

  private async answerLatestSecurityQuery(
    userInput: string,
    conversationHistory: ChatMessage[],
    contextBlock?: string,
  ): Promise<string> {
    const result = await this.smartSearchTool.run({
      query: userInput,
      max_results: 5,
      summarize: true,
    });

    if (!result.success || !result.result) {
      return '暂时无法实时检索最新漏洞信息。请稍后重试，或给我更具体的厂商、产品或 CVE 编号。';
    }

    const retrievalContext = this.formatSmartSearchResult(result.result);
    return this.answerWithRetrievedContext(
      userInput,
      conversationHistory,
      contextBlock,
      retrievalContext,
    );
  }

  private async answerWithRetrievedContext(
    userInput: string,
    conversationHistory: ChatMessage[],
    contextBlock: string | undefined,
    retrievalContext: string,
  ): Promise<string> {
    const recentHistory = conversationHistory.slice(-20);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'system', content: LIVE_QA_SYSTEM_PROMPT },
      ...(contextBlock
        ? [{ role: 'system' as const, content: `已注入上下文（优先参考）：\n${contextBlock}` }]
        : []),
      { role: 'system', content: `实时检索结果（优先参考）：\n${retrievalContext}` },
      ...recentHistory,
      { role: 'user', content: userInput },
    ];
    return this.llm.chat(messages);
  }

  private formatSmartSearchResult(raw: unknown): string {
    const result = raw as SmartSearchResult;
    const summary = String(result.ai_summary ?? '').trim();
    const sources = (result.results ?? [])
      .slice(0, 5)
      .map((item, index) => {
        const title = String(item.title ?? '').trim() || `结果 ${index + 1}`;
        const url = String(item.url ?? '').trim();
        const snippet = String(item.snippet ?? '').trim();
        const lines = [`[${index + 1}] ${title}`];
        if (url) lines.push(`URL: ${url}`);
        if (snippet) lines.push(`摘要: ${snippet}`);
        return lines.join('\n');
      })
      .join('\n\n');

    return [
      `查询: ${String(result.query ?? '')}`,
      `命中结果数: ${String(result.total ?? 0)}`,
      summary ? `工具摘要:\n${summary}` : '',
      sources ? `来源列表:\n${sources}` : '来源列表: （无可用来源）',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private formatCveLookupResult(raw: unknown): string {
    const result = raw as CveLookupResult;
    const affected = (result.affected_products ?? [])
      .slice(0, 5)
      .map((entry) => {
        const vendor = String(entry.vendor ?? '').trim();
        const product = String(entry.product ?? '').trim();
        const versions = (entry.versions ?? []).map((item) => String(item)).filter(Boolean);
        return [vendor, product].filter(Boolean).join(' / ') +
          (versions.length > 0 ? `（版本: ${versions.join(', ')}）` : '');
      })
      .filter(Boolean)
      .join('\n');
    const references = (result.references ?? [])
      .slice(0, 6)
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join('\n');
    const cvss = result.cvss
      ? `CVSS: ${String(result.cvss.score ?? '-')}` +
        ` / ${String(result.cvss.severity ?? '-')}` +
        (result.cvss.vector ? ` / ${String(result.cvss.vector)}` : '')
      : 'CVSS: （未提供）';

    return [
      `CVE: ${String(result.cve_id ?? '')}`,
      `状态: ${String(result.state ?? '') || '未知'}`,
      `发布时间: ${String(result.date_published ?? '') || '未知'}`,
      cvss,
      result.description ? `描述:\n${result.description}` : '',
      affected ? `受影响产品:\n${affected}` : '',
      references ? `参考链接:\n${references}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
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
