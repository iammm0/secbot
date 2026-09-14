import { useEffect, useState } from 'react'
import { applyTheme, DEFAULT_THEME, THEME_STORAGE_KEY, normalizeTheme } from '@/lib/theme'
import { getShowPet, setShowPet } from '@/lib/uiPrefs'

const THEMES = [
  { id: 'hacker', name: '黑客绿', primary: '#00ff88', secondary: '#00d4ff', accent: '#c084fc' },
  { id: 'light', name: '浅色', primary: '#059669', secondary: '#2563eb', accent: '#7c3aed' },
] as const

export function AppearanceConfig() {
  const [active, setActive] = useState(() => normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME))
  const [showPet, setShowPetState] = useState(() => getShowPet())

  useEffect(() => {
    applyTheme(active)
    localStorage.setItem(THEME_STORAGE_KEY, active)
  }, [active])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs uppercase tracking-wider text-text-dim">主题</h3>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              onClick={() => setActive(theme.id)}
              className={`rounded-lg border p-4 text-center transition-all ${
                active === theme.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-hover hover:border-text-dim/40'
              }`}
            >
              <div className="mb-2 flex justify-center gap-1">
                <span className="h-3 w-3 rounded-full" style={{ background: theme.primary }} />
                <span className="h-3 w-3 rounded-full" style={{ background: theme.secondary }} />
                <span className="h-3 w-3 rounded-full" style={{ background: theme.accent }} />
              </div>
              <span className="font-mono text-xs text-text">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs uppercase tracking-wider text-text-dim">桌面宠物</h3>
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-hover px-3 py-3">
          <div>
            <div className="text-sm text-text">展示 Secbot 宠物</div>
            <div className="mt-0.5 text-[11px] text-text-dim">在窗口右下角显示一只可点的小机器人</div>
          </div>
          <span
            role="switch"
            aria-checked={showPet}
            className={`relative h-5 w-9 rounded-full transition-colors ${showPet ? 'bg-primary' : 'bg-border'}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-popover shadow transition-transform ${
                showPet ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={showPet}
            onChange={event => {
              setShowPetState(event.target.checked)
              setShowPet(event.target.checked)
            }}
          />
        </label>
      </div>
    </div>
  )
}
