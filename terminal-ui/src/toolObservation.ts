/**
 * 工具执行结束后生成简短要点 + 节选正文，供「观察」块展示
 */

const EXPLORING_LABEL_TOOLS = new Set(["web_research", "web_crawler"]);
const TERMINAL_LABEL_TOOLS = new Set(["execute_command", "terminal_session"]);

export function formatToolResultRaw(result: unknown): string {
  if (result === null || result === undefined) return "";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

/** 从文本或 JSON 中抽取一两句可读摘要（无 LLM，纯启发式） */
export function summarizeToolOutput(
  tool: string,
  result: unknown,
  success: boolean,
  error?: string,
): string {
  if (!success && error) {
    return `未成功：${error.replace(/\s+/g, " ").trim().slice(0, 280)}`;
  }
  if (!success) {
    return "执行未成功，无返回内容。";
  }

  if (typeof result === "string") {
    const t = result.trim();
    if (!t) return "执行成功，无文本输出。";
    const oneLine = t.replace(/\r\n/g, "\n").split("\n").find((l) => l.trim()) ?? t;
    if (oneLine.length <= 200) return oneLine;
    return `${oneLine.slice(0, 200).trim()}…（共约 ${t.length} 字符）`;
  }

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const o = result as Record<string, unknown>;
    const keys = Object.keys(o).slice(0, 6);
    const bits: string[] = [];
    for (const k of keys) {
      const v = o[k];
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && v.length < 120) {
        bits.push(`${k}: ${v}`);
        continue;
      }
      if (typeof v === "number" || typeof v === "boolean") {
        bits.push(`${k}: ${String(v)}`);
      }
    }
    if (bits.length) return bits.slice(0, 4).join("；");
    return `返回 JSON 对象（字段：${keys.join(", ")}）`;
  }

  if (Array.isArray(result)) {
    return `返回列表，共 ${result.length} 项。`;
  }

  if (EXPLORING_LABEL_TOOLS.has(tool)) {
    return "联网查询已完成，详见下方节选。";
  }
  if (TERMINAL_LABEL_TOOLS.has(tool)) {
    return "命令已在代理终端中执行，详见下方输出节选。";
  }
  return "执行完成。";
}

export function buildObservationBody(
  tool: string,
  result: unknown,
  success: boolean,
  error?: string,
): string {
  const summary = summarizeToolOutput(tool, result, success, error);
  const raw = formatToolResultRaw(result);
  const errLine =
    !success && error
      ? `\n\n**错误**\n\n${error.trim()}`
      : "";
  const preview =
    raw.trim().length > 0
      ? `\n\n**输出（节选）**\n\n\`\`\`\n${truncateChars(raw.trim(), 3500)}\n\`\`\``
      : "";
  return `**要点**\n\n${summary}${preview}${errLine}`;
}

function truncateChars(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…（已截断）`;
}
