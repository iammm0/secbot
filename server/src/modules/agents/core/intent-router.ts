import { ChatMessage, Intent, IntentDecision } from '../../../common/types';
import { LLMProvider, createLLM } from '../../../common/llm';
import { SECBOT_GLOBAL_BRIEF, clipText } from './secbot-profile';

const VALID_INTENTS: Intent[] = [
  'small_talk',
  'meta',
  'qa',
  'clarify_needed',
  'task_simple',
  'task_complex',
];

const INTENT_SYSTEM_PROMPT =
  '你是 Secbot 的意图分类器，同时负责在非任务意图上给出可直接展示的回复。\n' +
  '分类要准，回答要吃上下文；不要执行工具，不要编造扫描/利用结果。\n\n' +
  SECBOT_GLOBAL_BRIEF +
  '\n\n分类（共 6 类）：\n' +
  '1) small_talk：闲聊、感谢、表情、确认（"嗯"/"ok"/"😊"）、纯礼貌。不需要工具、不需要安全知识。\n' +
  '2) meta：询问 Secbot 自身能力、工具列表、当前会话/历史/暂停任务、改设置、你是谁。结合【会话上下文】和【工具目录】回答。\n' +
  '3) qa：安全知识、概念、原理、提问类（"什么是 SSRF？"/"DNS 解析过程？"）。通常不需要执行工具；但若用户明确在问“最新/近期/当前”的漏洞或安全动态，仍归为 qa，由问答层决定是否做只读实时检索。qa 的 direct_response 可留空（后续 QA 会再答）。\n' +
  '4) clarify_needed：用户想做任务，但关键参数缺失（目标缺、模糊指代、范围不清），必须先追问。若会话 focus / pinned / 近期对话已经能解析指代（"刚才那个站"/"再扫一遍"），不要 clarify，应归 task_simple 或 task_complex。\n' +
  '5) task_simple：任务意图明确，且显然 1 步可解（"再跑一遍上次的端口扫描"/"对 1.2.3.4 ping 一下"），跳过复杂规划。\n' +
  '6) task_complex：任务，需要规划、并行/串行多步工具调用、可能要生成报告。\n\n' +
  '附加字段：\n' +
  '- confidence：0-1\n' +
  '- needs_explore：true 表示在执行前应先调用 ExploreAgent 做只读探索补上下文（例：用户提到了陌生目标、CVE 号、未知协议）；small_talk/meta 通常为 false。会话里已有该实体则不必 explore。\n' +
  '- needs_report：是否需要执行后产出结构化 SummaryAgent 报告。task_simple 通常 false，task_complex 通常 true。\n' +
  '- focus：从输入抽出的实体（IP、域名、CVE、目标系统、协议等），不超过 8 个，小写。可并入会话已有 focus。\n' +
  '- direct_response：small_talk / meta 必填，给用户看的完整回复（可分点、可短 Markdown）；必须使用本次同步的 Secbot 能力、工具目录、pinned/focus/暂停任务，以及用户自定义指令，禁止空话和编造。qa 可空。\n' +
  '- clarify_question：clarify_needed 必填，一个具体的追问，并点名还缺哪项（目标/范围/授权）。\n' +
  '- rationale：一句话解释为什么这么分类。\n\n' +
  '严格 JSON 输出（不要 Markdown 代码块、不要多余文字）：\n' +
  '{\n' +
  '  "intent": "small_talk|meta|qa|clarify_needed|task_simple|task_complex",\n' +
  '  "confidence": 0.0,\n' +
  '  "needs_explore": false,\n' +
  '  "needs_report": false,\n' +
  '  "focus": [],\n' +
  '  "direct_response": null,\n' +
  '  "clarify_question": null,\n' +
  '  "rationale": ""\n' +
  '}';

const SMALL_TALK_HINTS = [
  '你好',
  '嗨',
  '早上好',
  '下午好',
  '晚上好',
  '谢谢',
  '感谢',
  '辛苦',
  'ok',
  'hi',
  'hello',
  'hey',
  '可以',
];

const META_HINTS = [
  '你是谁',
  '你能做什么',
  '你能干嘛',
  'secbot',
  '怎么设置',
  '改设置',
  '设置模型',
  '切换模型',
  '清空记忆',
  '历史记录',
  '工具列表',
  '当前会话',
  '会话 id',
];

const TASK_HINTS = [
  '扫描',
  '渗透',
  '攻击',
  '检测',
  '探测',
  '枚举',
  '利用',
  '注入',
  '爆破',
  '提权',
  '嗅探',
  'scan',
  'exploit',
  'attack',
  'detect',
  'pentest',
  'enumerate',
  'brute',
  'inject',
];

export interface IntentPausedTaskBrief {
  originalMessage: string;
  progressNote: string;
}

export interface IntentRouteArgs {
  userInput: string;
  recentMessages: ChatMessage[];
  sessionFocus?: string[];
  unresolved?: string[];
  pinnedFacts?: string[];
  customInstructions?: string;
  pausedTask?: IntentPausedTaskBrief | null;
  agentType?: string;
  modelName?: string;
  toolCatalog?: string;
}

export class IntentRouter {
  private readonly _llm?: LLMProvider;

  private get llm(): LLMProvider {
    return this._llm ?? createLLM();
  }

  constructor(llm?: LLMProvider) {
    this._llm = llm;
  }

  async classify(args: IntentRouteArgs): Promise<IntentDecision> {
    const heuristic = this.heuristic(args.userInput);
    const fast = this.fastPath(heuristic);
    if (fast) return fast;

    const recentSliced = (args.recentMessages ?? []).slice(-6).map((m) => ({
      role: m.role,
      content: clipText(m.content, 480),
    }));
    const messages: ChatMessage[] = [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      ...recentSliced,
      { role: 'user', content: this.buildUserPrompt(args) },
    ];

    try {
      const raw = await this.llm.chat(messages);
      const parsed = this.parse(raw);
      if (parsed) {
        return this.mergeWithHeuristic(parsed, heuristic, args);
      }
    } catch {
      /* LLM 不可用 / 解析失败：走启发式 */
    }
    return this.fallback(heuristic);
  }

  /** 明显闲聊且无任务词时跳过分类 LLM；meta 仍走 LLM 以便带上工具目录 */
  private fastPath(heuristic: ReturnType<IntentRouter['heuristic']>): IntentDecision | null {
    if (heuristic.isTask || heuristic.hasUnknownEntity || heuristic.isMeta) return null;
    if (!heuristic.isSmallTalk) return null;
    return {
      intent: 'small_talk',
      confidence: 0.92,
      needsExplore: false,
      needsReport: false,
      focus: heuristic.focus,
      directResponse: '收到～有需要执行的安全任务随时说。',
      clarifyQuestion: null,
      rationale: 'fast-path small_talk',
    };
  }

  private buildUserPrompt(args: IntentRouteArgs): string {
    const parts = [`本轮用户输入：\n${args.userInput}`];
    const agentType = args.agentType?.trim();
    const modelName = args.modelName?.trim();
    if (agentType || modelName) {
      parts.push(
        `当前运行：agent=${agentType || 'hackbot'}${modelName ? `；model=${modelName}` : ''}`,
      );
    }
    if (args.sessionFocus && args.sessionFocus.length > 0) {
      parts.push(`会话 focus：${args.sessionFocus.join(', ')}`);
    }
    if (args.unresolved && args.unresolved.length > 0) {
      parts.push(`未解决问题：${args.unresolved.join('; ')}`);
    }
    if (args.pinnedFacts && args.pinnedFacts.length > 0) {
      parts.push(`已钉选事实：\n- ${args.pinnedFacts.join('\n- ')}`);
    }
    if (args.customInstructions?.trim()) {
      parts.push(`用户自定义指令（回复时必须遵守）：\n${clipText(args.customInstructions, 2000)}`);
    }
    if (args.pausedTask?.originalMessage) {
      const note = args.pausedTask.progressNote?.trim();
      parts.push(
        `暂停中的任务：${args.pausedTask.originalMessage}${note ? `（进度：${note}）` : ''}`,
      );
    }
    if (args.toolCatalog?.trim()) {
      parts.push(`工具目录（名称，按类别）：\n${args.toolCatalog.trim()}`);
    }
    parts.push('请结合以上 Secbot 全局信息与会话上下文分类，并按 JSON 输出。');
    return parts.join('\n\n');
  }

  private parse(raw: string): IntentDecision | null {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[0]) as Record<string, unknown>;
      const intent = (obj.intent as Intent) ?? 'qa';
      if (!VALID_INTENTS.includes(intent)) return null;
      const confidence = toNum(obj.confidence, 0.5);
      const needsExplore = toBool(obj.needs_explore, false);
      const needsReport = toBool(obj.needs_report, intent === 'task_complex');
      const focus = toStringArray(obj.focus).slice(0, 8);
      const directResponse = toNullableString(obj.direct_response);
      const clarifyQuestion = toNullableString(obj.clarify_question);
      const rationale = typeof obj.rationale === 'string' ? obj.rationale : '';
      return {
        intent,
        confidence,
        needsExplore,
        needsReport,
        focus,
        directResponse,
        clarifyQuestion,
        rationale,
      };
    } catch {
      return null;
    }
  }

  private mergeWithHeuristic(
    decision: IntentDecision,
    heuristic: ReturnType<IntentRouter['heuristic']>,
    args: IntentRouteArgs,
  ): IntentDecision {
    const merged = new Set([...decision.focus, ...heuristic.focus]);
    const knownContext =
      (args.sessionFocus ?? []).length > 0 ||
      (args.pinnedFacts ?? []).length > 0 ||
      Boolean(args.pausedTask?.originalMessage);
    return {
      ...decision,
      focus: [...merged].slice(0, 12),
      /** task_simple 且会话已有 focus/pinned 时不强开 Explore；陌生实体仅对 task_complex 启发式补开 */
      needsExplore:
        decision.intent === 'task_simple' && knownContext
          ? false
          : decision.needsExplore ||
            (decision.intent === 'task_complex' && heuristic.hasUnknownEntity && !knownContext),
    };
  }

  private fallback(heuristic: ReturnType<IntentRouter['heuristic']>): IntentDecision {
    let intent: Intent = 'qa';
    if (heuristic.isSmallTalk) intent = 'small_talk';
    else if (heuristic.isMeta) intent = 'meta';
    else if (heuristic.isTask) intent = 'task_complex';
    return {
      intent,
      confidence: 0.4,
      needsExplore: intent === 'task_complex' && heuristic.hasUnknownEntity,
      needsReport: intent === 'task_complex',
      focus: heuristic.focus,
      directResponse: null,
      clarifyQuestion: null,
      rationale: 'fallback (heuristic)',
    };
  }

  private heuristic(text: string): {
    isSmallTalk: boolean;
    isMeta: boolean;
    isTask: boolean;
    hasUnknownEntity: boolean;
    focus: string[];
  } {
    const lower = text.toLowerCase().trim();
    const isSmallTalk =
      lower.length <= 6 && SMALL_TALK_HINTS.some((k) => lower.includes(k.toLowerCase()));
    const isMeta = META_HINTS.some((k) => lower.includes(k.toLowerCase()));
    const isTask = TASK_HINTS.some((k) => lower.includes(k.toLowerCase()));

    const focusSet = new Set<string>();
    const patterns: RegExp[] = [
      /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
      /\bcve-\d{4}-\d{4,7}\b/gi,
      /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b/gi,
      /https?:\/\/[^\s)>"']+/gi,
    ];
    for (const re of patterns) {
      const found = text.match(re);
      if (found) for (const f of found) focusSet.add(f.toLowerCase());
    }
    return {
      isSmallTalk,
      isMeta,
      isTask,
      hasUnknownEntity: focusSet.size > 0,
      focus: [...focusSet].slice(0, 8),
    };
  }
}

function toNum(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const lower = v.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  return fallback;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim().toLowerCase());
  }
  return out;
}

function toNullableString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}
