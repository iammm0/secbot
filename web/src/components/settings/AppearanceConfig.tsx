import { useEffect, useState } from 'react'
import {
  getStoredTheme,
  setStoredTheme,
  type ThemePreference,
  watchSystemTheme,
} from '@/lib/theme'
import { getShowPet, setShowPet } from '@/lib/uiPrefs'

const THEMES: Array<{ id: ThemePreference; name: string; hint: string; swatches: string[] }> = [
  {
    id: 'system',
    name: '跟随系统',
    hint: '自动匹配操作系统深浅色',
    swatches: ['#71717a', '#00ff88', '#059669'],
  },
  {
    id: 'hacker',
    name: '黑客绿',
    hint: '深色 · 霓虹绿',
    swatches: ['#00ff88', '#00d4ff', '#c084fc'],
  },
  {
    id: 'light',
    name: '浅色',
    hint: '亮底 · 翠绿点缀',
    swatches: ['#059669', '#2563eb', '#7c3aed'],
  },
]

export function AppearanceConfig() {
  const [active, setActive] = useState<ThemePreference>(() => getStoredTheme())
  const [showPet, setShowPetState] = useState(() => getShowPet())

  useEffect(() => {
    setStoredTheme(active)
  }, [active])

  useEffect(() => watchSystemTheme(), [])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs uppercase tracking-wider text-text-dim">主题</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setActive(theme.id)}
              className={`rounded-lg border p-4 text-left transition-all ${
                active === theme.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-hover hover:border-text-dim/40'
              }`}
            >
              <div className="mb-2 flex gap-1">
                {theme.swatches.map((color) => (
                  <span key={color} className="h-3 w-3 rounded-full" style={{ background: color }} />
                ))}
              </div>
              <div className="font-mono text-xs text-text">{theme.name}</div>
              <div className="mt-1 text-[10px] text-text-dim">{theme.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs uppercase tracking-wider text-text-dim">桌面宠物</h3>
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-hover px-3 py-3">
          <div>
            <div className="text-sm text-text">展示 Secbot 悬浮宠物</div>
            <div className="mt-0.5 text-[11px] text-text-dim">
              可拖动的悬浮窗；任务进行中会有小动画
            </div>
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
            onChange={(event) => {
              setShowPetState(event.target.checked)
              setShowPet(event.target.checked)
            }}
          />
        </label>
      </div>
    </div>
  )
}
