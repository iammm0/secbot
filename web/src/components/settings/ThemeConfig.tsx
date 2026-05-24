import { useEffect, useState } from 'react'

const THEMES = [
  { id: 'hacker', name: '黑客绿', primary: '#00ff88', secondary: '#00d4ff', accent: '#c084fc' },
  { id: 'cyber', name: '赛博蓝', primary: '#00d4ff', secondary: '#6366f1', accent: '#f472b6' },
  { id: 'phantom', name: '幻影紫', primary: '#c084fc', secondary: '#f472b6', accent: '#00ff88' },
] as const

export function ThemeConfig() {
  const [active, setActive] = useState(() => localStorage.getItem('secbot-theme') ?? 'hacker')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', active)
    localStorage.setItem('secbot-theme', active)
  }, [active])

  return (
    <div className="space-y-4">
      <h3 className="text-xs uppercase tracking-wider text-text-dim">主题</h3>
      <div className="grid grid-cols-3 gap-3">
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`p-4 rounded-lg border transition-all text-center ${
              active === t.id
                ? 'border-primary/60 bg-primary/10 shadow-[0_0_12px_rgba(0,255,136,0.15)]'
                : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
          >
            <div className="flex justify-center gap-1 mb-2">
              <span className="w-3 h-3 rounded-full" style={{ background: t.primary }} />
              <span className="w-3 h-3 rounded-full" style={{ background: t.secondary }} />
              <span className="w-3 h-3 rounded-full" style={{ background: t.accent }} />
            </div>
            <span className="text-xs font-mono text-text">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
