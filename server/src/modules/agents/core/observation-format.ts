/**
 * 将工具结果格式化为传给模型 / SSE 的 Observation 文本
 */

export function truncateMiddleText(
  text: string,
  maxLen: number,
  headChars: number,
  tailChars: number,
): string {
  const t = text.replace(/\r\n/g, '\n');
  if (t.length <= maxLen) return t;
  const h = Math.min(headChars, Math.max(800, Math.floor(maxLen * 0.4)));
  const tl = Math.min(tailChars, Math.max(800, Math.floor(maxLen * 0.4)));
  if (h + tl >= t.length) return t;
  const omitted = t.length - h - tl;
  return `${t.slice(0, h)}\n\n…（已省略中间约 ${omitted} 字符）…\n\n${t.slice(-tl)}`;
}

export function formatExecuteCommandObservation(result: Record<string, unknown>): string {
  const command = String(result.command ?? '(未知)');
  const code = result.returncode;
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const primary =
    typeof result.output === 'string' && result.output.length > 0
      ? result.output
      : [stdout, stderr].filter((s) => s.length > 0).join('\n--- stderr ---\n');
  const merged = primary.trim() || '(无输出)';
  const body = truncateMiddleText(merged, 12_000, 3_500, 3_500);
  return (
    `**执行的命令**\n\n\`${command}\`\n\n` +
    `**退出码** ${code ?? 'n/a'}\n\n` +
    `**输出**\n\n\`\`\`text\n${body}\n\`\`\``
  );
}
