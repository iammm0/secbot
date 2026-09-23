import { Intent } from '../types';

function clipText(text: string, maxChars: number): string {
  const value = text ?? '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}
import { getJevRuntimeConfig, isJevStageEnabled, type JevRuntimeConfig } from './jev-config';
import {
  createJevClient,
  type JevAnswer,
  type JevChoiceAnswer,
  type JevClient,
  type JevNoulAnswer,
  type JevScoreAnswer,
} from './jev.client';

const VALID_INTENTS: Intent[] = [
  'small_talk',
  'meta',
  'qa',
  'clarify_needed',
  'task_simple',
  'task_complex',
];

export interface JevIntentResult {
  intent: Intent;
  confidence: number;
  needsExplore: boolean;
  needsReport: boolean;
}

function asNoul(answer: JevAnswer | undefined): JevNoulAnswer | null {
  if (!answer || answer.type !== 'noul') return null;
  if (typeof answer.noul !== 'number' || !Number.isFinite(answer.noul)) return null;
  return answer;
}

function asChoice(answer: JevAnswer | undefined): JevChoiceAnswer | null {
  if (!answer || answer.type !== 'choice') return null;
  if (typeof answer.choice !== 'string' || !answer.choice) return null;
  return answer;
}

function asScore(answer: JevAnswer | undefined): JevScoreAnswer | null {
  if (!answer || answer.type !== 'score') return null;
  if (typeof answer.score !== 'number' || !Number.isFinite(answer.score)) return null;
  return answer;
}

/** Noul has no separate confidence field; use distance from 0.5. */
export function noulDecisionConfidence(noul: number): number {
  return Math.max(noul, 1 - noul);
}

export function acceptChoice(answer: JevAnswer | undefined, minConfidence: number): string | null {
  const choice = asChoice(answer);
  if (!choice) return null;
  if (choice.confidence < minConfidence) return null;
  return choice.choice;
}

export function acceptNoulYes(
  answer: JevAnswer | undefined,
  minConfidence: number,
): boolean | null {
  const noul = asNoul(answer);
  if (!noul) return null;
  if (noulDecisionConfidence(noul.noul) < minConfidence) return null;
  return noul.noul >= 0.5;
}

export function noulInUncertainBand(noul: number, low = 0.35, high = 0.65): boolean {
  return noul >= low && noul <= high;
}

export async function classifyIntentWithJev(
  state: string,
  client: JevClient = createJevClient(),
  config: JevRuntimeConfig = getJevRuntimeConfig(),
): Promise<JevIntentResult | null> {
  if (!isJevStageEnabled('intent', config)) return null;
  try {
    const response = await client.systemOne({
      state,
      questions: {
        intent: {
          type: 'choice',
          instructions:
            'Classify the latest user message for Secbot, a security automation assistant. Pick one label.',
          criteria: {
            small_talk:
              'Chit-chat, thanks, emoji, or a short acknowledgment with no security task.',
            meta: 'Asking about Secbot itself, available tools, settings, the current session, or history.',
            qa: 'A knowledge question about security concepts; no tool execution is needed.',
            clarify_needed:
              'The user wants a task but a critical parameter (target, scope, or authorization) is missing and cannot be resolved from session context.',
            task_simple: 'A clear one-step security task that does not need multi-step planning.',
            task_complex:
              'A multi-step security task that needs planning, several tools, or a written report.',
          },
        },
        needs_explore: {
          type: 'noul',
          instructions:
            'Should a read-only ExploreAgent run first to gather context about an unfamiliar target, CVE, or protocol before executing tools?',
          criteria: {
            true: 'Unfamiliar entity not already in session focus or pinned facts.',
            false: 'Already known from session, or exploration is unnecessary.',
          },
        },
        needs_report: {
          type: 'noul',
          instructions: 'After this task, should Secbot produce a structured SummaryAgent report?',
          criteria: {
            true: 'Complex work that benefits from a written report.',
            false: 'Simple/one-step task, QA, or chat.',
          },
        },
      },
    });
    const intentLabel = acceptChoice(response.answers.intent, config.confidenceMin);
    if (!intentLabel || !VALID_INTENTS.includes(intentLabel as Intent)) return null;
    const intent = intentLabel as Intent;
    const choice = asChoice(response.answers.intent);
    const explore = acceptNoulYes(response.answers.needs_explore, config.confidenceMin);
    const report = acceptNoulYes(response.answers.needs_report, config.confidenceMin);
    return {
      intent,
      confidence: choice?.confidence ?? config.confidenceMin,
      needsExplore: explore ?? false,
      needsReport: report ?? intent === 'task_complex',
    };
  } catch {
    return null;
  }
}

export async function shouldRetrieveLiveWithJev(
  input: string,
  client: JevClient = createJevClient(),
  config: JevRuntimeConfig = getJevRuntimeConfig(),
): Promise<boolean | null> {
  if (!isJevStageEnabled('qaLive', config)) return null;
  try {
    const response = await client.systemOne({
      state: input,
      questions: {
        live: {
          type: 'noul',
          instructions:
            'Is the user asking about the latest, recent, or currently unfolding vulnerabilities, zero-days, or threat landscape (not a timeless concept question)?',
          criteria: {
            true: 'Needs up-to-date retrieval about current vulns or threat news.',
            false: 'Timeless concept, product capability, or unrelated.',
          },
        },
      },
    });
    const noul = asNoul(response.answers.live);
    if (!noul) return null;
    if (noulInUncertainBand(noul.noul)) return null;
    return noul.noul > 0.65;
  } catch {
    return null;
  }
}

/**
 * Return true to skip the extra Planner round.
 * Fail-open: errors or low confidence keep today's "always replan" behavior.
 */
export async function shouldSkipAdaptiveReplan(
  summary: string,
  cancelledCount: number,
  client: JevClient = createJevClient(),
  config: JevRuntimeConfig = getJevRuntimeConfig(),
): Promise<boolean> {
  if (!isJevStageEnabled('adaptive', config) || cancelledCount <= 0) return false;
  try {
    const response = await client.systemOne({
      state: `Cancelled todos: ${cancelledCount}\n\nStage summary:\n${clipText(summary, 4000)}`,
      questions: {
        worth_replan: {
          type: 'noul',
          instructions:
            'Are these failed or cancelled subtasks worth another planning round that would produce useful new work, rather than repeating the same failures?',
          criteria: {
            true: 'New follow-up todos would likely make progress.',
            false: 'Another plan would repeat failures or add no value.',
          },
        },
      },
    });
    const noul = asNoul(response.answers.worth_replan);
    if (!noul) return false;
    if (noul.noul >= 0.5) return false;
    return noulDecisionConfidence(noul.noul) >= config.confidenceMin;
  } catch {
    return false;
  }
}

export async function shouldNudgeReactStop(
  args: {
    userGoal: string;
    observation: string;
    tool: string;
  },
  client: JevClient = createJevClient(),
  config: JevRuntimeConfig = getJevRuntimeConfig(),
): Promise<boolean> {
  if (!isJevStageEnabled('reactStop', config)) return false;
  try {
    const response = await client.systemOne({
      state:
        `User goal:\n${clipText(args.userGoal, 1200)}\n\n` +
        `Latest tool: ${args.tool}\nObservation:\n${clipText(args.observation, 3000)}`,
      questions: {
        progress: {
          type: 'score',
          instructions: 'How much did the latest tool observation advance the user goal?',
          criteria: [
            'No progress or error only',
            'Some useful signal',
            'Clear material progress toward the goal',
          ],
        },
        can_stop: {
          type: 'noul',
          instructions:
            'Does the agent already have enough evidence to write a Final Answer without another tool call, unless a critical gap remains?',
          criteria: {
            true: 'Enough evidence to conclude now.',
            false: 'Still missing a critical next step.',
          },
        },
      },
    });
    const noul = asNoul(response.answers.can_stop);
    const score = asScore(response.answers.progress);
    if (!noul || !score) return false;
    if (noul.noul < config.reactStopMin) return false;
    if (score.confidence < config.confidenceMin) return false;
    return score.score >= 1.5;
  } catch {
    return false;
  }
}

export async function filterContextSnippetsWithJev(
  args: {
    query: string;
    focus: string[];
    items: Array<{ id: string; content: string }>;
  },
  client: JevClient = createJevClient(),
  config: JevRuntimeConfig = getJevRuntimeConfig(),
): Promise<Set<string> | null> {
  if (!isJevStageEnabled('context', config) || args.items.length === 0) return null;
  const capped = args.items.slice(0, 12);
  const numbered = capped
    .map((item, index) => `[${index + 1}] ${clipText(item.content, 400)}`)
    .join('\n\n');
  const questions: Record<
    string,
    { type: 'noul'; instructions: string; criteria: { true: string; false: string } }
  > = {};
  for (let i = 0; i < capped.length; i++) {
    questions[`item_${i}`] = {
      type: 'noul',
      instructions: `Is snippet ${i + 1} relevant to the current query and focus?`,
      criteria: {
        true: 'Helps answer the current query or matches focus entities.',
        false: 'Off-topic, stale, or duplicate noise.',
      },
    };
  }
  try {
    const response = await client.systemOne({
      state: `Query: ${args.query}\nFocus: ${args.focus.join(', ') || '(none)'}\n\nSnippets:\n${numbered}`,
      questions,
    });
    const keep = new Set<string>();
    for (let i = 0; i < capped.length; i++) {
      const noul = asNoul(response.answers[`item_${i}`]);
      if (!noul || noul.noul >= 0.4) {
        keep.add(capped[i].id);
      }
    }
    return keep;
  } catch {
    return null;
  }
}

export const JEV_REACT_STOP_NUDGE =
  '上一轮工具观察已足够收束。请仅按以下格式回复，不要再调用工具，除非仍有关键信息缺口：\n' +
  'Thought: <一句话原因>\n' +
  'Final Answer: <最终结论>';

export const JEV_PROBE_STATE =
  'Help! My payouts have been failing for 3 days and I am losing sales. Please help ASAP.';
