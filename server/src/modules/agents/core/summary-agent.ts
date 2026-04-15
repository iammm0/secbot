import { BaseAgent } from './base-agent';
import { ChatMessage, InteractionSummary, TodoItem, TodoStatus } from '../../../common/types';
import { LLMProvider, createLLM } from '../../../common/llm';

interface SummarizeOptions {
  todos?: TodoItem[];
  thoughts?: string[];
  observations?: string[];
  toolResults?: Array<{ tool: string; success: boolean; result: string }>;
  mode?: 'brief' | 'full';
}

const SUMMARY_SYSTEM_PROMPT =
  '你是一个安全测试报告生成专家。你的任务是根据测试过程中的数据，' +
  '生成结构化的安全测试报告。\n\n' +
  '报告要求：\n' +
  '1. 语言简洁专业，使用中文。\n' +
  '2. 包含任务概述、关键发现、风险评估、修复建议和总结。\n' +
  '3. 关键发现需要按严重程度排序（高危 > 中危 > 低危 > 信息）。\n' +
  '4. 修复建议要具体可操作，而非泛泛而谈。\n' +
  '5. 全文控制在约 600–1200 汉字；用要点归纳，禁止大段粘贴原始 JSON、进程列表或完整配置文件。';

const MAX_THOUGHT_CHARS = 1_200;
const MAX_OBS_CHARS = 2_500;

function clipForSummary(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n…（已截断，原文约 ${t.length} 字符）`;
}

export class SummaryAgent extends BaseAgent {
  private readonly llm: LLMProvider;

  constructor() {
    super('Summary', SUMMARY_SYSTEM_PROMPT);
    this.llm = createLLM();
  }

  async process(userInput: string, options?: Record<string, unknown>): Promise<string> {
    const summarizeOptions = options as unknown as SummarizeOptions | undefined;
    const summary = await this.summarizeInteraction(userInput, summarizeOptions);
    return summary.rawReport;
  }

  async summarizeInteraction(
    userInput: string,
    options?: SummarizeOptions,
  ): Promise<InteractionSummary> {
    const mode = options?.mode ?? 'full';
    const prompt = this.buildSummaryPrompt(userInput, options);

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: prompt },
    ];

    const rawReport = await this.llm.chat(messages);

    const keyFindings = this.extractSection(rawReport, '关键发现', '主要发现', '发现');
    const recommendations = this.extractSection(rawReport, '修复建议', '建议', '推荐');
    const conclusion = this.extractConclusion(rawReport);

    const todoCompletion = this.buildTodoCompletion(options?.todos);

    if (mode === 'brief') {
      const briefPrompt = `请将以下安全测试报告压缩为 3-5 句话的摘要，保留最关键的发现和建议：\n\n${rawReport}`;
      const briefMessages: ChatMessage[] = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: briefPrompt },
      ];
      const briefSummary = await this.llm.chat(briefMessages);

      return {
        taskSummary: briefSummary,
        todoCompletion,
        keyFindings,
        actionSummary: this.extractSection(rawReport, '执行操作', '操作记录', '操作'),
        riskAssessment: this.extractRiskAssessment(rawReport),
        recommendations,
        overallConclusion: conclusion,
        rawReport,
      };
    }

    return {
      taskSummary: this.extractTaskSummary(rawReport, userInput),
      todoCompletion,
      keyFindings,
      actionSummary: this.extractSection(rawReport, '执行操作', '操作记录', '操作'),
      riskAssessment: this.extractRiskAssessment(rawReport),
      recommendations,
      overallConclusion: conclusion,
      rawReport,
    };
  }

  private buildSummaryPrompt(userInput: string, options?: SummarizeOptions): string {
    const parts: string[] = [`## 原始任务\n${userInput}`];

    if (options?.todos?.length) {
      const todoLines = options.todos.map(
        (t) =>
          `- [${t.status === TodoStatus.COMPLETED ? '✓' : t.status === TodoStatus.CANCELLED ? '✗' : '○'}] ` +
          `${t.content}${t.resultSummary ? ` → ${t.resultSummary}` : ''}`,
      );
      parts.push(`## 任务清单\n${todoLines.join('\n')}`);
    }

    if (options?.thoughts?.length) {
      const lines = options.thoughts.map(
        (t, i) => `${i + 1}. ${clipForSummary(t, MAX_THOUGHT_CHARS)}`,
      );
      parts.push(`## 分析思路\n${lines.join('\n')}`);
    }

    if (options?.observations?.length) {
      const lines = options.observations.map(
        (o, i) => `${i + 1}. ${clipForSummary(o, MAX_OBS_CHARS)}`,
      );
      parts.push(`## 观察结果\n${lines.join('\n')}`);
    }

    if (options?.toolResults?.length) {
      const toolLines = options.toolResults.map(
        (r) =>
          `- **${r.tool}**: ${r.success ? '成功' : '失败'} — ${clipForSummary(String(r.result ?? ''), MAX_OBS_CHARS)}`,
      );
      parts.push(`## 工具执行结果\n${toolLines.join('\n')}`);
    }

    parts.push(
      '\n请根据以上信息生成一份结构化安全测试报告，包含以下章节：\n' +
        '1. **任务概述**\n' +
        '2. **关键发现**（按严重程度排序）\n' +
        '3. **执行操作**\n' +
        '4. **风险评估**\n' +
        '5. **修复建议**\n' +
        '6. **总结**',
    );

    return parts.join('\n\n');
  }

  private extractSection(report: string, ...headings: string[]): string[] {
    for (const heading of headings) {
      const pattern = new RegExp(
        `(?:#{1,3}\\s*)?(?:\\d+\\.\\s*)?\\**${heading}\\**[：:]?\\s*\\n([\\s\\S]*?)(?=\\n(?:#{1,3}\\s|\\d+\\.\\s*\\**)|\n*$)`,
      );
      const match = report.match(pattern);
      if (match) {
        return match[1]
          .split('\n')
          .map((line) => line.replace(/^[\s\-*•·]+/, '').trim())
          .filter((line) => line.length > 0);
      }
    }
    return [];
  }

  private extractConclusion(report: string): string {
    const lines = this.extractSection(report, '总结', '结论', '总体结论');
    return lines.join('\n') || '暂无总结信息。';
  }

  private extractRiskAssessment(report: string): string {
    const lines = this.extractSection(report, '风险评估', '风险分析', '风险');
    return lines.join('\n') || '暂无风险评估信息。';
  }

  private extractTaskSummary(report: string, userInput: string): string {
    const lines = this.extractSection(report, '任务概述', '概述');
    return lines.join('\n') || `针对任务「${userInput}」的安全测试报告。`;
  }

  private buildTodoCompletion(todos?: TodoItem[]): Record<string, unknown> {
    if (!todos?.length) {
      return { total: 0, completed: 0, cancelled: 0, pending: 0, rate: '0%' };
    }

    const total = todos.length;
    const completed = todos.filter((t) => t.status === TodoStatus.COMPLETED).length;
    const cancelled = todos.filter((t) => t.status === TodoStatus.CANCELLED).length;
    const pending = total - completed - cancelled;
    const rate = total > 0 ? `${Math.round((completed / total) * 100)}%` : '0%';

    return { total, completed, cancelled, pending, rate };
  }
}
