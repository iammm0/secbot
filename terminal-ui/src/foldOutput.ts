const PREFERRED_PARAM_KEYS = [
  "command",
  "url",
  "query",
  "path",
  "file",
  "target",
  "cve",
  "cve_id",
  "host",
  "ip",
] as const;

export const COLLAPSED_PREVIEW_LINES = 3;
export const COLLAPSED_PREVIEW_CHARS = 280;

export function formatToolArg(params?: Record<string, unknown>): string {
  if (!params) return "";
  for (const key of PREFERRED_PARAM_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) {
      const one = value.trim().replace(/\s+/g, " ");
      return one.length > 80 ? `${one.slice(0, 80)}…` : one;
    }
  }
  try {
    const json = JSON.stringify(params);
    if (!json || json === "{}") return "";
    return json.length > 80 ? `${json.slice(0, 80)}…` : json;
  } catch {
    return "";
  }
}

export function peekableOutput(text: string): string {
  const fence = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (fence?.[1]?.trim()) return fence[1].trim();
  return text
    .replace(/^\*\*[^*]+\*\*\s*/gm, "")
    .replace(/^`([^`]+)`\s*$/gm, "$1")
    .trim();
}

export function foldText(
  text: string,
  maxLines = COLLAPSED_PREVIEW_LINES,
  maxChars = COLLAPSED_PREVIEW_CHARS,
): { preview: string; hiddenLines: number; totalLines: number; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/^\s+|\s+$/g, "");
  if (!normalized) {
    return { preview: "", hiddenLines: 0, totalLines: 0, truncated: false };
  }
  const lines = normalized.split("\n");
  const totalLines = lines.length;
  const usedLines = Math.min(maxLines, totalLines);
  let preview = lines.slice(0, usedLines).join("\n");
  if (preview.length > maxChars) {
    preview = `${preview.slice(0, maxChars).trimEnd()}…`;
  }
  const hiddenLines = Math.max(0, totalLines - usedLines);
  return {
    preview,
    hiddenLines,
    totalLines,
    truncated: hiddenLines > 0 || normalized.length > maxChars,
  };
}

export function foldBody(body: string, maxLines = COLLAPSED_PREVIEW_LINES): string {
  const { preview, hiddenLines, truncated } = foldText(body, maxLines);
  if (!truncated) return body;
  if (!preview) return `… 另有 ${hiddenLines} 行已折叠`;
  return `${preview}\n… 另有 ${hiddenLines} 行已折叠`;
}

export interface FoldMeta {
  body: string;
  fullBody?: string;
  previewBody?: string;
  hiddenLines?: number;
  foldable?: boolean;
  defaultExpanded?: boolean;
}

export function makeFoldable(
  full: string,
  options: { maxLines?: number; defaultExpanded?: boolean } = {},
): FoldMeta {
  const maxLines = options.maxLines ?? COLLAPSED_PREVIEW_LINES;
  const defaultExpanded = options.defaultExpanded ?? false;
  const folded = foldText(full, maxLines);
  if (!folded.truncated) {
    return { body: full };
  }
  const previewBody = foldBody(full, maxLines);
  return {
    body: defaultExpanded ? full : previewBody,
    fullBody: full,
    previewBody,
    hiddenLines: folded.hiddenLines,
    foldable: true,
    defaultExpanded,
  };
}

export function displayBodyForFold(
  block: {
    id: string;
    body: string;
    fullBody?: string;
    previewBody?: string;
    foldable?: boolean;
    defaultExpanded?: boolean;
  },
  expandedOverride: Record<string, boolean>,
): string {
  if (!block.foldable || !block.fullBody) return block.body;
  const expanded = expandedOverride[block.id] ?? block.defaultExpanded ?? false;
  return expanded ? block.fullBody : (block.previewBody ?? block.body);
}
