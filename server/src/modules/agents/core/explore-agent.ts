import { BaseAgent } from './base-agent';
import { BaseTool } from '../../tools/core/base-tool';
import { BrowserSessionTool } from '../../tools/web-research/browser-session.tool';
import { EventType, BusEvent } from '../../../common/event-bus';
import {
  ChatMessage,
  ContextPatch,
  ContextPatchFact,
  IntentDecision,
} from '../../../common/types';
import { LLMProvider, createLLM } from '../../../common/llm';
import { validateToolInvocation } from './tool-action-validate';
import { parseToolAction, type ParsedAction } from './parse-tool-action';

const EXPLORE_SYSTEM_PROMPT =
  '你是 secbot 的 ExploreAgent。你的唯一目标是：' +
  '在执行真正的安全任务前，用 **只读、低成本** 的工具调用补全上下文，' +
  '把关键事实写入会话的「上下文池」。\n\n' +
  '硬性原则：\n' +
  '1) **绝对禁止**任何修改、写入、破坏性、需要授权确认的操作（任何 sensitive 工具会被自动拒绝）。\n' +
  '2) 优先使用 **vuln_db_query**（开源漏洞库 NVD/CVE.org/Exploit-DB/MITRE）与 **browser_session**（虚拟浏览器，可像人一样冲浪），' +
  '其次使用 page_extract / smart_search / deep_crawl / api_client / OSINT 工具；端口探测等只做基础识别，不做利用。\n' +
  '3) 不要回答用户的问题，不要执行任务，不要写报告。**你只补上下文**。\n' +
  '4) 收集到关键事实就立即出 Final Patch，不要为了"再找一找"无意义跳页。\n\n' +
  '【像人一样浏览网页（browser_session 工具）】\n' +
  '步骤建议：\n' +
  '  a) 先用 `action="search"` 搜索关键词，看 3-6 个候选的 title + snippet\n' +
  '  b) 选最像答案的 `action="follow"` 进入；若链接太多，可 `action="read"` 看某个 section\n' +
  '  c) 信息不够就 `action="back"` 或再 `follow` 下一个候选；同一 session 内 follow 链接，不要重复 search\n' +
  '  d) 把每次发现写到 `action="note"`，结束时随 Patch 输出关键 note\n' +
  '  e) 每次调用都必须带相同的 `session_id`（参数已注入，见下方 BrowserSessionContext）\n' +
  '  f) 不要超过 25 跳，能 3-6 跳找到答案最佳\n\n' +
  '【漏洞库（vuln_db_query 工具）】\n' +
  '  - 输入包含 CVE 编号 → 直接 `cve_id` 查\n' +
  '  - 输入提到产品/版本（如 "log4j 2.14.x", "Spring Cloud 2022"）→ `query` 自然语言查\n' +
  '  - 已经有扫描结果对象 → `scan_result` 映射\n\n' +
  '输出格式（每轮）：\n' +
  '当你需要使用工具：\n' +
  'Thought: 需要补的事实 / 工具与参数\n' +
  'Action: {"tool": "tool_name", "params": {"key": "value"}}\n' +
  '（params 必须是含至少一个有效字段的对象）\n\n' +
  '当你已经收集足够信息或不需要工具时：\n' +
  'Thought: 我已经收集足够信息\n' +
  'Final Patch: <严格 JSON，schema 见下>\n\n' +
  'Final Patch JSON schema：\n' +
  '{\n' +
  '  "facts": [\n' +
  '    {"key":"短英文 id（snake_case）", "value":"事实文本", "priority":0.0-1.0, "ttl":"turn|session|persistent", "tags":["..."]}\n' +
  '  ],\n' +
  '  "pinned": ["原文字符串，可选"],\n' +
  '  "unresolved": ["仍然缺的关键信息"],\n' +
  '  "suggested_focus": ["关键词，小写"],\n' +
  '  "explore_summary": "一句话总结你做了什么"\n' +
  '}\n' +
  'facts 内容要 **简洁、可复用**：例如 target_ip / asset_type / detected_service / cve_relevance / owner_authorization_state。';

const DEFAULT_MAX_ITERATIONS = 12;

function resolveDefaultMaxIterations(): number {
  const raw = (process.env.SECBOT_EXPLORE_MAX_ITERS ?? '').trim();
  if (!raw) return DEFAULT_MAX_ITERATIONS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_ITERATIONS;
  return Math.min(40, Math.max(1, Math.floor(n)));
}

type OnEventCallback = (event: BusEvent) => void;

export interface ExploreArgs {
  userInput: string;
  intent?: IntentDecision;
  contextBlock?: string;
  onEvent?: OnEventCallback;
  /** 默认 3 */
  maxIterations?: number;
}

export class ExploreAgent extends BaseAgent {
  private readonly browserSessionTool: BrowserSessionTool | null;

  private get llm(): LLMProvider {
    return createLLM();
  }

  constructor(tools: BaseTool[], browserSessionTool: BrowserSessionTool | null = null) {
    super('Explore', EXPLORE_SYSTEM_PROMPT, tools);
    /** 显式传入的优先；否则从 tools 中按 name 找一个 */
    if (browserSessionTool) {
      this.browserSessionTool = browserSessionTool;
    } else {
      const found = this.toolsDict.get('browser_session');
      this.browserSessionTool = found instanceof BrowserSessionTool ? found : null;
    }
  }

  /** BaseAgent 兼容方法；调用方应优先用 explore() */
  async process(userInput: string, options?: Record<string, unknown>): Promise<string> {
    const patch = await this.explore({
      userInput,
      onEvent: options?.onEvent as OnEventCallback | undefined,
      contextBlock: options?.contextBlock as string | undefined,
    });
    return patch.exploreSummary ?? JSON.stringify(patch);
  }

  async explore(args: ExploreArgs): Promise<ContextPatch> {
    const { userInput, intent, contextBlock, onEvent } = args;
    const defaultMax = resolveDefaultMaxIterations();
    const maxIterations = Math.max(1, Math.min(args.maxIterations ?? defaultMax, 40));

    /** 为本次 explore 生成独立的虚拟浏览器 session_id，结束时主动关闭 */
    const browserSessionId = `expl-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    onEvent?.({
      type: EventType.EXPLORE_START,
      data: {
        agent: this.name,
        userInput,
        focus: intent?.focus ?? [],
        browser_session_id: browserSessionId,
      },
      timestamp: new Date(),
      iteration: 0,
    });

    const focusHint =
      intent?.focus && intent.focus.length > 0
        ? `\n【路由层 focus】${intent.focus.join(', ')}`
        : '';
    const intentHint = intent
      ? `\n【路由层意图】${intent.intent}（${intent.rationale ?? ''}）`
      : '';
    const ctxHint = contextBlock ? `\n【已注入上下文】\n${contextBlock}` : '';
    const browserHint = `\n【BrowserSessionContext】调用 browser_session 时务必带 session_id="${browserSessionId}"。`;

    const userPrompt =
      `用户原始请求：${userInput}` +
      intentHint +
      focusHint +
      ctxHint +
      browserHint +
      `\n\n可用工具（**优先**：vuln_db_query、browser_session；其次：page_extract、smart_search、deep_crawl、api_client；按需用 OSINT 类）:\n${this.getToolsDescription()}` +
      `\n\n请按 ReAct 循环工作，最多 ${maxIterations} 轮。完成后必须输出 Final Patch JSON。`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    let lastThought = '';
    let patch: ContextPatch | null = null;

    try {
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const thought = await this.llm.chat(messages);
      lastThought = thought;

      onEvent?.({
        type: EventType.EXPLORE_STEP,
        data: { agent: this.name, iteration, kind: 'thought', thought },
        timestamp: new Date(),
        iteration,
      });

      const inlinePatch = this.extractPatch(thought);
      if (inlinePatch) {
        patch = inlinePatch;
        break;
      }

      const action = this.parseAction(thought);
      if (!action) {
        /** 没工具调用又没 Final Patch：要求模型补一份 patch */
        messages.push({ role: 'assistant', content: thought });
        messages.push({
          role: 'user',
          content:
            '上一步既没有调用工具，也没有输出 Final Patch。请立即输出 Final Patch JSON。' +
            '如果没有可补的事实，输出 facts:[]、unresolved 列出仍然缺的信息。',
        });
        continue;
      }

      const paramErr = validateToolInvocation(action.tool, action.params);
      if (paramErr) {
        const observation = `[参数错误] ${paramErr}`;
        onEvent?.({
          type: EventType.EXPLORE_STEP,
          data: {
            agent: this.name,
            iteration,
            kind: 'action_error',
            tool: action.tool,
            observation,
          },
          timestamp: new Date(),
          iteration,
        });
        messages.push({ role: 'assistant', content: thought });
        messages.push({ role: 'user', content: `Observation: ${observation}` });
        continue;
      }

      const tool = this.toolsDict.get(action.tool);
      if (!tool) {
        const observation = `[错误] 未知工具: ${action.tool}`;
        messages.push({ role: 'assistant', content: thought });
        messages.push({ role: 'user', content: `Observation: ${observation}` });
        continue;
      }

      if (tool.sensitive) {
        const observation = `[拒绝] 工具 ${action.tool} 标记为敏感，ExploreAgent 仅允许调用只读类工具。`;
        onEvent?.({
          type: EventType.EXPLORE_STEP,
          data: {
            agent: this.name,
            iteration,
            kind: 'sensitive_denied',
            tool: action.tool,
          },
          timestamp: new Date(),
          iteration,
        });
        messages.push({ role: 'assistant', content: thought });
        messages.push({ role: 'user', content: `Observation: ${observation}` });
        continue;
      }

      onEvent?.({
        type: EventType.EXPLORE_STEP,
        data: {
          agent: this.name,
          iteration,
          kind: 'action_start',
          tool: action.tool,
          params: action.params,
        },
        timestamp: new Date(),
        iteration,
      });

      let observation: string;
      try {
        const result = await tool.run(action.params);
        observation = result.success
          ? this.formatObservation(result.result)
          : `[错误] ${result.error ?? '未知错误'}`;
      } catch (err) {
        observation = `[异常] ${err instanceof Error ? err.message : String(err)}`;
      }

      onEvent?.({
        type: EventType.EXPLORE_STEP,
        data: {
          agent: this.name,
          iteration,
          kind: 'action_result',
          tool: action.tool,
          observation,
        },
        timestamp: new Date(),
        iteration,
      });

      messages.push({ role: 'assistant', content: thought });
      messages.push({ role: 'user', content: `Observation: ${observation}` });
    }

    if (!patch) {
      /** 兜底：再向模型要一次 Final Patch */
      messages.push({
        role: 'user',
        content:
          '已达到最大迭代次数。请立刻输出 Final Patch JSON；如果没有补充事实，' +
          'facts:[] 并在 unresolved 中说明缺什么。',
      });
      try {
        const lastTry = await this.llm.chat(messages);
        patch = this.extractPatch(lastTry) ?? this.extractPatch(lastThought);
      } catch {
        patch = null;
      }
    }

    const finalPatch: ContextPatch = patch ?? {
      facts: [],
      unresolved: ['ExploreAgent 未能给出有效的 Patch'],
      exploreSummary: 'explore failed',
    };

    onEvent?.({
      type: EventType.EXPLORE_END,
      data: {
        agent: this.name,
        factsCount: finalPatch.facts?.length ?? 0,
        unresolved: finalPatch.unresolved ?? [],
        summary: finalPatch.exploreSummary ?? '',
      },
      timestamp: new Date(),
      iteration: 0,
    });

    return finalPatch;
    } finally {
      /** 释放本次 explore 的虚拟浏览器 session，避免内存泄漏 */
      try {
        this.browserSessionTool?.closeSession(browserSessionId);
      } catch {
        /* close 失败不影响 explore 结果 */
      }
    }
  }

  // ------ internals ------

  private extractPatch(text: string): ContextPatch | null {
    const match = text.match(/Final\s*Patch\s*:\s*(\{[\s\S]*\})/i);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[1]) as Record<string, unknown>;
      return this.normalizePatch(obj);
    } catch {
      return null;
    }
  }

  private normalizePatch(obj: Record<string, unknown>): ContextPatch {
    const rawFacts = Array.isArray(obj.facts) ? (obj.facts as unknown[]) : [];
    const facts: ContextPatchFact[] = [];
    for (const item of rawFacts) {
      if (!item || typeof item !== 'object') continue;
      const f = item as Record<string, unknown>;
      const key = typeof f.key === 'string' ? f.key.trim() : '';
      const value = typeof f.value === 'string' ? f.value.trim() : '';
      if (!key || !value) continue;
      const priority =
        typeof f.priority === 'number' && Number.isFinite(f.priority)
          ? Math.min(1, Math.max(0, f.priority))
          : 0.7;
      const ttl = (typeof f.ttl === 'string' ? f.ttl.toLowerCase() : 'session') as
        | 'turn'
        | 'session'
        | 'persistent';
      const tags = Array.isArray(f.tags)
        ? (f.tags as unknown[])
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [];
      facts.push({
        key,
        value,
        priority,
        ttl: ['turn', 'session', 'persistent'].includes(ttl) ? ttl : 'session',
        tags,
      });
    }

    const stringArray = (v: unknown): string[] =>
      Array.isArray(v)
        ? (v as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim())
        : [];

    return {
      facts,
      pinned: stringArray(obj.pinned).filter(Boolean).slice(0, 16),
      unresolved: stringArray(obj.unresolved).filter(Boolean).slice(0, 16),
      suggestedFocus: stringArray(obj.suggested_focus).map((s) => s.toLowerCase()).slice(0, 12),
      exploreSummary: typeof obj.explore_summary === 'string' ? obj.explore_summary.trim() : '',
    };
  }

  private parseAction(thought: string): ParsedAction | null {
    /** Final Patch 由 extractPatch 单独处理；这里只解析普通工具 Action */
    if (/Final\s*Patch\s*:/i.test(thought)) return null;
    return parseToolAction(thought);
  }

  private formatObservation(result: unknown): string {
    if (typeof result === 'string') return result.slice(0, 2_000);
    try {
      return JSON.stringify(result, null, 2).slice(0, 2_000);
    } catch {
      return String(result).slice(0, 2_000);
    }
  }
}
