import React, { createContext, useContext, useMemo, useCallback, useRef } from 'react';

export interface CommandOption {
  title: string;
  value: string;
  category: string;
  keybind?: string;
  slash?: string;
  onSelect: (dialog: { close: () => void }) => void;
}

interface InternalCommand extends CommandOption {
  _id: number;
}

interface CommandContextValue {
  commands: CommandOption[];
  register: (cmd: CommandOption) => () => void;
  trigger: (value: string) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = React.useState<InternalCommand[]>([]);
  const nextId = useRef(0);

  const register = useCallback((cmd: CommandOption) => {
    const id = nextId.current++;
    setList((prev) => [...prev, { ...cmd, _id: id }]);
    return () => setList((prev) => prev.filter((c) => c._id !== id));
  }, []);

  const trigger = useCallback((value: string) => {
    const cmd = list.find((c) => c.value === value);
    if (cmd) cmd.onSelect({ close: () => {} });
  }, [list]);

  const value = useMemo(
    () => ({ commands: list, register, trigger }),
    [list, register, trigger]
  );

  return (
    <CommandContext.Provider value={value}>
      {children}
    </CommandContext.Provider>
  );
}

export function useCommand(): CommandContextValue {
  const ctx = useContext(CommandContext);
  if (!ctx) throw new Error('useCommand must be used within CommandProvider');
  return ctx;
}
