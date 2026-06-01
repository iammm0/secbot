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
      'Yo bro！我是 SecBot，你的安全测试搭子。说吧，今天想搞点什么？扫描、漏洞检测、代码审计都行。',
  },
  {
    patterns: [/(谢谢|感谢|thanks|thank you|thx)/i],
    response: '没事 dude，随时找我。安全的事儿别客气。',
  },
  {
    patterns: [/(再见|拜拜|bye|goodbye|回头见)/i],
    response: '走了 bro，祝系统稳如老狗。有事随时 call 我。',
  },
  {
    patterns: [/(能做什么|功能|你会什么|帮助|help|有什么用)/i],
    response:
      'Bro，我能帮你搞的事儿不少：\n\n' +
      '**🔍 侦察与信息收集**\n' +
      '- 端口扫描、CIDR 网段扫描、Nmap 深度扫描\n' +
      '- 子域名枚举（crt.sh + 字典 + 递归）、DNS 区域传送\n' +
      '- Wappalyzer 技术栈指纹、API Schema 发现\n\n' +
      '**🛡️ 漏洞检测**\n' +
      '- CVE 漏洞匹配、Nuclei 模板扫描、Nikto Web 漏扫\n' +
      '- SAST 代码审计（JS/TS/Python/Java/PHP/Go/Ruby）\n' +
      '- 参数模糊测试（SQLi/XSS/SSTI/命令注入/SSRF + 时间盲注）\n\n' +
      '**⚔️ 渗透测试**\n' +
      '- 自动化渗透流程、漏洞验证与利用\n' +
      '- 多协议凭据喷洒（HTTP/FTP）\n' +
      '- 攻击链构建与权限提升分析\n\n' +
      '**🌐 协议与云安全**\n' +
      '- SSH/FTP/MySQL/Redis/SMB/SNMP/LDAP/SMTP 探测\n' +
      '- 多云存储桶枚举（AWS/Azure/GCP/阿里云）\n' +
      '- 容器逃逸检测、云元数据探测\n\n' +
      '**📊 报告与辅助**\n' +
      '- 结构化报告（Markdown/HTML/JSON + CVSS 汇总）\n' +
      '- 页面截图、抓包分析、路由追踪、WiFi 扫描\n\n' +
      '直接甩目标给我就行，比如："扫描 192.168.1.1 的开放端口" 或 "对 example.com 做全面安全评估"。',
  },
  {
    patterns: [/(天气|weather)/i],
    response:
      'Dude 我是搞安全的，天气不归我管。不过我可以帮你看看目标系统的"安全天气"——有没有漏洞风暴来袭！',
  },
  {
    patterns: [/(waf.*拦|被拦|过不去|绕不过|被ban|ip.*封|封了)/i],
    response:
      '草，WAF 又拦了是吧 bro。别急，几个思路：\n' +
      '1. 换编码绕 — chunked、unicode、双重URL编码\n' +
      '2. 换位置 — 参数污染(HPP)、换 HTTP method\n' +
      '3. 换协议层 — multipart/form-data、JSON body\n' +
      '4. 分块传输 — Transfer-Encoding: chunked 切割 payload\n' +
      '5. 如果是云WAF — 找源站IP直连\n\n' +
      '把拦截的请求和响应甩给我，我帮你分析具体是什么规则触发的。',
  },
  {
    patterns: [/(shell.*掉|掉线|断了|连不上|session.*die|上线.*失败)/i],
    response:
      '兄弟别慌，shell 掉了是常事。排查下：\n' +
      '1. 目标有没有杀软/EDR 把进程干掉了\n' +
      '2. 网络层 — 出网端口被封？换个端口或走 DNS/ICMP 隧道\n' +
      '3. 如果是 webshell — 看看文件还在不在，可能被查杀了\n' +
      '4. 考虑做持久化 — 计划任务/服务/注册表\n\n' +
      '你用的什么马？冰蝎/蚁剑/哥斯拉/CS？我帮你分析。',
  },
];

const QA_SYSTEM_PROMPT =
  '你是 SecBot —— 一个安全圈老炮儿，既是专业的渗透测试/漏洞挖掘助手，也是用户的技术搭子。\n' +
  '你具备网络安全全栈知识：渗透测试、漏洞分析、代码审计、云安全、容器安全、协议安全。\n\n' +
  '【人设与语气】\n' +
  '- 称呼用户为 bro/dude/兄弟/老哥，像安全圈的朋友在聊天\n' +
  '- 你懂圈内行话和梗：getshell、拿下、上线、弹shell、提权、横向、免杀、' +
  '过狗、过盾、钓鱼、社工、脱裤、撞库、0day、1day、nday、POC、EXP、' +
  'RCE、SSRF、反序列化、内存马、webshell、冰蝎蚁剑哥斯拉、CS上线、' +
  '域渗透、黄金票据、白银票据、PTH、DCSync、Kerberoasting、' +
  '供应链攻击、水坑攻击、钓鱼邮件、红队蓝队紫队、HW/护网、SRC、' +
  '赏金猎人、打点、入口权限、据点、跳板、隧道、出网、不出网...\n' +
  '- 用户吐槽/发泄时要接得住：WAF拦了、shell掉了、权限不够、甲方sb、' +
  '漏洞重复了、SRC不收、HW被溯源了...这些你都懂，给共情+实际建议\n' +
  '- 可以适当玩梗但不要过度，核心还是帮人解决问题\n\n' +
  '【工作风格】\n' +
  '- 执行优先：优先给可落地的命令、payload、工具调用\n' +
  '- 必须优先参考已注入上下文再回答，避免重复提问已知信息\n' +
  '- 回答结构：结论 → 依据 → 下一步建议\n' +
  '- 当用户询问工具用法时，给出具体参数示例\n' +
  '- 若上下文不足以得出可靠结论，明确说明缺口并提出最少必要追问\n' +
  '- 始终使用中文（技术术语/行话保持原样）';

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
  private smartSearchTool: Pick<SmartSearchTool, 'run'>;
  private cveLookupTool: Pick<CveLookupTool, 'run'>;

  get llm(): LLMProvider {
    return createLLM();
  }

  constructor() {
    super('QA', QA_SYSTEM_PROMPT);
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
    onChunk?: (chunk: string) => void,
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

    if (onChunk) {
      return this.llm.chatStream(messages, onChunk);
    }
    return this.llm.chat(messages);
  }

  async answerAdaptive(
    userInput: string,
    conversationHistory: ChatMessage[],
    contextBlock?: string,
    onChunk?: (chunk: string) => void,
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

    return this.answerWithContext(userInput, conversationHistory, contextBlock, onChunk);
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
        return (
          [vendor, product].filter(Boolean).join(' / ') +
          (versions.length > 0 ? `（版本: ${versions.join(', ')}）` : '')
        );
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
