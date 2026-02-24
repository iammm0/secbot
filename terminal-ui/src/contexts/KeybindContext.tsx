import React, { createContext, useContext, useMemo } from 'react';

/** 按键描述：name 如 'c', ctrl 表示 Ctrl+key */
export interface ParsedKey {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
}

export type KeybindId =
  | 'exit'
  | 'command_list'
  | 'escape'
  | 'page_up'
  | 'page_down'
  | 'messages_first'
  | 'messages_last'
  | 'messages_half_page_up'
  | 'messages_half_page_down'
  | 'messages_previous'
  | 'messages_next'
  | 'scrollbar_toggle'
  | 'expand_block';

/** 内置默认 keybinds；可从后端 config.keybinds 或本地配置覆盖 */
export const DEFAULT_KEYBINDS: Record<KeybindId, { keys: ParsedKey[]; label: string }> = {
  exit: { keys: [{ name: 'c', ctrl: true }], label: 'Ctrl+C' },
  command_list: { keys: [{ name: 'k', ctrl: true }], label: 'Ctrl+K' },
  escape: { keys: [{ name: 'escape' }], label: 'Esc' },
  page_up: { keys: [{ name: 'pageup' }], label: 'Page Up' },
  page_down: { keys: [{ name: 'pagedown' }], label: 'Page Down' },
  messages_first: { keys: [{ name: 'home' }], label: 'Home' },
  messages_last: { keys: [{ name: 'end' }], label: 'End' },
  messages_half_page_up: { keys: [{ name: 'pageup', ctrl: true }], label: 'Ctrl+Page Up' },
  messages_half_page_down: { keys: [{ name: 'pagedown', ctrl: true }], label: 'Ctrl+Page Down' },
  messages_previous: { keys: [], label: '上一条消息' },
  messages_next: { keys: [], label: '下一条消息' },
  scrollbar_toggle: { keys: [], label: '切换滚动条' },
  expand_block: { keys: [{ name: 'e', ctrl: true }], label: 'Ctrl+E' },
};

/** 从配置合并 keybinds；若传入 partial 则覆盖默认值，否则用默认 */
export function mergeKeybinds(
  partial?: Record<string, { keys?: ParsedKey[]; label?: string }> | null
): Record<KeybindId, { keys: ParsedKey[]; label: string }> {
  const out = { ...DEFAULT_KEYBINDS };
  if (!partial) return out;
  for (const id of Object.keys(partial) as KeybindId[]) {
    if (!(id in out)) continue;
    const p = partial[id];
    if (p?.keys) out[id].keys = p.keys;
    if (p?.label) out[id].label = p.label;
  }
  return out;
}

interface KeybindContextValue {
  match: (id: KeybindId, evt: ParsedKey) => boolean;
  print: (id: KeybindId) => string;
  keybinds: Record<KeybindId, { keys: ParsedKey[]; label: string }>;
}

/** Ink useInput 的 key 形状（仅用到的字段） */
export interface InkKey {
  ctrl?: boolean;
  shift?: boolean;
  escape?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  home?: boolean;
  end?: boolean;
}

/** 将 Ink (input, key) 转为 ParsedKey，供 match 使用 */
export function inkKeyToParsedKey(input: string, key: InkKey): ParsedKey {
  if (key.escape) return { name: 'escape' };
  if (key.home) return { name: 'home' };
  if (key.end) return { name: 'end' };
  if (key.ctrl && key.pageUp) return { name: 'pageup', ctrl: true };
  if (key.ctrl && key.pageDown) return { name: 'pagedown', ctrl: true };
  if (key.pageUp) return { name: 'pageup' };
  if (key.pageDown) return { name: 'pagedown' };
  if (key.ctrl && input) return { name: input.toLowerCase(), ctrl: true, shift: key.shift };
  return { name: (input || 'unknown').toLowerCase() };
}

function matchKey(parsed: ParsedKey, target: ParsedKey): boolean {
  if (parsed.name.toLowerCase() !== target.name.toLowerCase()) return false;
  if (!!parsed.ctrl !== !!target.ctrl) return false;
  if (!!parsed.shift !== !!target.shift) return false;
  return true;
}

const KeybindContext = createContext<KeybindContextValue | null>(null);

export function KeybindProvider({
  children,
  keybinds: configKeybinds,
}: {
  children: React.ReactNode;
  /** 可选：从后端或本地配置传入，覆盖默认 keybinds */
  keybinds?: Record<string, { keys?: ParsedKey[]; label?: string }> | null;
}) {
  const keybinds = useMemo(() => mergeKeybinds(configKeybinds), [configKeybinds]);
  const value = useMemo<KeybindContextValue>(
    () => ({
      keybinds,
      match(id, evt) {
        const bind = keybinds[id];
        if (!bind) return false;
        return bind.keys.some((k) => matchKey(evt, k));
      },
      print(id) {
        return keybinds[id]?.label ?? id;
      },
    }),
    [keybinds]
  );
  return (
    <KeybindContext.Provider value={value}>
      {children}
    </KeybindContext.Provider>
  );
}

export function useKeybind(): KeybindContextValue {
  const ctx = useContext(KeybindContext);
  if (!ctx) throw new Error('useKeybind must be used within KeybindProvider');
  return ctx;
}
