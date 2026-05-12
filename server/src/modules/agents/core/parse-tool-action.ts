/**
 * 解析 LLM 输出中的 ReAct Action JSON。
 *
 * 真实的模型输出五花八门，常见变体：
 *   Action: {"tool": "x", "params": {...}}
 *   **Action:** {"tool": "x", ...}
 *   Action:
 *   ```json
 *   { "tool": "x", "params": {} }
 *   ```
 *   行动：{"tool": "x", "params": {"a": "b"}}
 *   action: { ... 嵌套 { ... } ... }
 *
 * 旧版 lazy 正则 `Action\s*:\s*(\{[\s\S]*?\})\s*(?:\n|$)` 无法跨过：
 *  - markdown 粗体 `**Action:**`
 *  - 包围在 ```json``` 代码块里的 JSON
 *  - params 里嵌套对象时 lazy `[\s\S]*?\}` 在内层 `}` 提前停止
 * 这里改用「定位标签 → 跳过 markdown 装饰 → 平衡花括号扫描」的方式重写。
 */

export interface ParsedAction {
  tool: string;
  params: Record<string, unknown>;
}

/** 同时匹配中英文标签 + markdown 粗体修饰 */
const ACTION_LABEL_REGEX =
  /(^|\n)\s*\**\s*(?:action|行动|动作)\s*\**\s*[:：]\s*\**\s*/i;

const FINAL_ANSWER_REGEX = /(?:Final\s*Answer|最终(?:回答|答案|结论))\s*[:：]/i;

const CODE_BLOCK_REGEX = /^\s*```(?:json|JSON|js|javascript|ts)?\s*([\s\S]*?)```/;

export function parseToolAction(thought: string): ParsedAction | null {
  if (!thought) return null;

  if (FINAL_ANSWER_REGEX.test(thought)) {
    /** 模型已经声明 Final Answer：交给上层处理，不再解析 Action */
    return null;
  }

  const labelMatch = ACTION_LABEL_REGEX.exec(thought);
  if (!labelMatch) return null;

  const afterLabel = thought.slice(labelMatch.index + labelMatch[0].length);

  /** 优先匹配 ```json ... ``` 代码块包裹 */
  const codeBlock = afterLabel.match(CODE_BLOCK_REGEX);
  if (codeBlock) {
    const candidate = stripJsonNoise(codeBlock[1]);
    const parsed = tryParseAction(candidate);
    if (parsed) return parsed;
  }

  /** 否则按平衡花括号扫描第一个完整 JSON 对象 */
  const jsonCandidate = extractFirstJsonObject(afterLabel);
  if (jsonCandidate) {
    const parsed = tryParseAction(jsonCandidate);
    if (parsed) return parsed;
  }

  /** 兜底：原始正则（兼容旧路径），避免回归 */
  const legacy = afterLabel.match(/^\s*(\{[\s\S]*\})\s*(?:\n|$)/);
  if (legacy) {
    const parsed = tryParseAction(legacy[1]);
    if (parsed) return parsed;
  }

  return null;
}

/** 平衡花括号扫描，支持字符串内的转义、嵌套对象 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/** 去掉 LLM 偶尔加在 JSON 前后的奇怪标点，比如逗号、句号、markdown 残留 */
function stripJsonNoise(text: string): string {
  return text
    .trim()
    .replace(/^[`*\s]+/, '')
    .replace(/[`*\s]+$/, '');
}

function tryParseAction(jsonText: string): ParsedAction | null {
  try {
    const parsed = JSON.parse(jsonText) as {
      tool?: unknown;
      params?: unknown;
    };
    if (typeof parsed.tool !== 'string' || !parsed.tool.trim()) return null;
    const params =
      parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)
        ? (parsed.params as Record<string, unknown>)
        : {};
    return { tool: parsed.tool.trim(), params };
  } catch {
    return null;
  }
}

/** 给 SecurityReActAgent / ExploreAgent 复用：判断模型是否在文本里明确给出了 Final Answer */
export function hasFinalAnswer(thought: string): boolean {
  return FINAL_ANSWER_REGEX.test(thought);
}

export function extractFinalAnswer(thought: string): string | null {
  const match = thought.match(
    /(?:Final\s*Answer|最终(?:回答|答案|结论))\s*[:：]\s*([\s\S]*)/i,
  );
  return match ? match[1].trim() : null;
}
