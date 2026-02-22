import React, { createContext, useContext, useMemo } from 'react';

/** 按键描述：name 如 'c', ctrl 表示 Ctrl+key */
export interface ParsedKey {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
}

export type KeybindId = 'exit' | 'command_list' | 'escape';

interface KeybindContextValue {
  match: (id: KeybindId, evt: ParsedKey) => boolean;
  print: (id: KeybindId) => string;
}

const keybinds: Record<KeybindId, { keys: ParsedKey[]; label: string }> = {
  exit: { keys: [{ name: 'c', ctrl: true }], label: 'Ctrl+C' },
  command_list: { keys: [{ name: 'k', ctrl: true }], label: 'Ctrl+K' },
  escape: { keys: [{ name: 'escape' }], label: 'Esc' },
};

function matchKey(parsed: ParsedKey, target: ParsedKey): boolean {
  if (parsed.name.toLowerCase() !== target.name.toLowerCase()) return false;
  if (!!parsed.ctrl !== !!target.ctrl) return false;
  if (!!parsed.shift !== !!target.shift) return false;
  return true;
}

const KeybindContext = createContext<KeybindContextValue | null>(null);

export function KeybindProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<KeybindContextValue>(() => ({
    match(id, evt) {
      const bind = keybinds[id];
      if (!bind) return false;
      return bind.keys.some((k) => matchKey(evt, k));
    },
    print(id) {
      return keybinds[id]?.label ?? id;
    },
  }), []);
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
