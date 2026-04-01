import { useEffect, useMemo, useRef, useState } from "react";

export interface CommandOption {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  disabled?: boolean;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  options: CommandOption[];
  onClose: () => void;
}

function matchesQuery(option: CommandOption, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [option.label, option.description, ...(option.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((part) => haystack.includes(part));
}

export function CommandPalette({ open, options, onClose }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(
    () => options.filter((option) => matchesQuery(option, query)),
    [options, query],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (filtered.length === 0) return 0;
      return Math.min(current, filtered.length - 1);
    });
  }, [filtered.length]);

  if (!open) return null;

  const active = filtered[selectedIndex];

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette">
        <div className="palette-header">
          <span className="palette-kbd">Cmd/Ctrl + K</span>
          <span className="palette-hint">Enter 执行 · Esc 关闭</span>
        </div>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder="搜索命令、工具、能力…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelectedIndex((current) =>
                Math.min(current + 1, Math.max(0, filtered.length - 1)),
              );
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelectedIndex((current) => Math.max(0, current - 1));
              return;
            }
            if (event.key === "Enter" && active && !active.disabled) {
              event.preventDefault();
              active.onSelect();
              onClose();
            }
          }}
        />
        <div className="palette-results">
          {filtered.length === 0 ? (
            <div className="palette-empty">没有匹配到命令</div>
          ) : (
            filtered.map((option, index) => {
              const selected = index === selectedIndex;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`palette-item ${selected ? "selected" : ""}`}
                  disabled={option.disabled}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    if (option.disabled) return;
                    option.onSelect();
                    onClose();
                  }}
                >
                  <span className="palette-item-label">{option.label}</span>
                  <span className="palette-item-description">{option.description}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
