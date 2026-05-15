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
      '你好！我是 SecBot 安全测试助手，有什么可以帮你的吗？你可以让我进行安全扫描、漏洞检测、代码审计等操作。',
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
      '你可以直接告诉我目标，例如："扫描 192.168.1.1 的开放端口" 或 "对 example.com 做全面安全评估"。',
  },
  {
    patterns: [/(天气|weather)/i],
    response:
      '抱歉，我是安全测试专用助手，无法查询天气信息。不过我可以帮你检测目标系统的"安全天气"——看看有没有漏洞风暴来袭！',
  },
];

const QA_SYSTEM_PROMPT =
  '你是 SecBot 的安全问答助手，工作风格为执行优先。\n' +
  '你具备网络安全全栈知识：渗透测试、漏洞分析、代码审计、云安全、容器安全、协议安全。\n' +
  '必须优先参考已注入上下文再回答，避免重复提问已知信息。\n' +
  '回答结构：结论 → 依据 → 下一步建议；尽量给可直接执行的建议。\n' +
  '若上下文不足以得出可靠结论，请明确说明缺口并提出最少必要追问。\n' +
  '当用户询问工具用法时，给出具体参数示例。\n' +
  '始终使用中文。';

export class QAAgent extends BaseAgent {
  get llm(): LLMProvider {
    return createLLM();
  }

  constructor() {
    super('QA', QA_SYSTEM_PROMPT);
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
