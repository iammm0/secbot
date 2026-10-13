/** 按候选键读取第一个非空字符串。数组只取其中的字符串项。 */
export function firstString(params: Record<string, unknown>, keys: string[]): string {
  return stringList(params, keys)[0] ?? '';
}

/** 合并多个候选键里的字符串和字符串数组，并去重。 */
export function stringList(params: Record<string, unknown>, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const value = params[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = String(item ?? '').trim();
        if (text) values.push(text);
      }
      continue;
    }
    const text = String(value ?? '').trim();
    if (text && text !== 'undefined') values.push(text);
  }
  return [...new Set(values)];
}
