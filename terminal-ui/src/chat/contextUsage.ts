import type { ContextUsagePart } from "./types.js";

export function parseContextUsageParts(raw: unknown): ContextUsagePart[] {
  if (!Array.isArray(raw)) return [];
  const parts: ContextUsagePart[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const tokens = Number(rec.tokens ?? 0);
    if (!Number.isFinite(tokens) || tokens <= 0) continue;
    const id = typeof rec.id === "string" && rec.id ? rec.id : "other";
    const label = typeof rec.label === "string" && rec.label ? rec.label : id;
    parts.push({ id, label, tokens: Math.round(tokens) });
  }
  return parts;
}
