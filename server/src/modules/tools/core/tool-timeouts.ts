/** 各工具自己的超时。调用方传入的 timeout 只在这个上限内生效。 */
export const TOOL_TIMEOUTS = {
  nuclei_scan: { defaultSec: 1200, maxSec: 3600 },
  nikto_scan: { defaultSec: 600, maxSec: 1800 },
  nmap_scan: { defaultSec: 300, maxSec: 1800 },
  ffuf_scan: { defaultSec: 300, maxSec: 1200 },
  execute_command: { defaultSec: 30, maxSec: 1800 },
} as const;

export type TimedTool = keyof typeof TOOL_TIMEOUTS;

export function resolveToolTimeout(tool: TimedTool, requested?: unknown): number {
  const spec = TOOL_TIMEOUTS[tool];
  const value = Number(requested);
  const chosen = Number.isFinite(value) && value > 0 ? value : spec.defaultSec;
  return Math.min(Math.max(1, Math.floor(chosen)), spec.maxSec);
}

export function timeoutLabel(tool: string, timeoutSec: number): string {
  return `${tool} 超时上限 ${timeoutSec} 秒`;
}
