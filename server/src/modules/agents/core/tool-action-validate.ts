/**
 * ReAct Action 参数校验：禁止「仅有工具名、params 为空或无有效字段」的调用（少数只读工具除外）。
 */

/** 允许 params 为空对象或无非空字段的工具（无需显式参数即可工作） */
export const TOOLS_ALLOW_EMPTY_PARAMS = new Set<string>(['system_info', 'network_analyze']);

function countEffectiveKeys(params: Record<string, unknown>): number {
  return Object.keys(params).filter((k) => {
    const v = params[k];
    if (v === undefined || v === null) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return true;
  }).length;
}

/**
 * @returns 错误说明；null 表示通过
 */
export function validateToolInvocation(
  tool: string,
  params: Record<string, unknown> | null | undefined,
): string | null {
  const name = (tool ?? '').trim();
  if (!name) return '工具名为空';

  if (params === undefined || params === null) {
    return `工具 ${name} 缺少 params，必须为 JSON 对象且包含有效参数`;
  }
  if (typeof params !== 'object' || Array.isArray(params)) {
    return `工具 ${name} 的 params 必须是对象，不能为数组或其它类型`;
  }

  if (name === 'execute_command') {
    const cmd = String(params.command ?? '').trim();
    if (!cmd) {
      return 'execute_command 必须提供非空字符串参数 command（要执行的 shell 命令）';
    }
    return null;
  }

  if (TOOLS_ALLOW_EMPTY_PARAMS.has(name)) {
    return null;
  }

  if (countEffectiveKeys(params) === 0) {
    return (
      `工具 ${name} 的 params 不能为空对象：` +
      `请至少提供一个有意义的参数键值（布尔 false / 数字 0 视为有效，需写在 JSON 中）`
    );
  }

  return null;
}
