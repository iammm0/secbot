import { useEffect, useState } from 'react'
import { getShowPet, PREFS_EVENT } from '@/lib/uiPrefs'

const LINES = ['需要帮忙吗？', '授权范围内随时待命。', '点我不会咬人。', '黑客绿还是浅色，你说了算。']

export function SecbotPet() {
  const [visible, setVisible] = useState(() => getShowPet())
  const [bubble, setBubble] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => setVisible(getShowPet())
    window.addEventListener(PREFS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PREFS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {bubble ? (
        <div className="pointer-events-none max-w-44 rounded-lg border border-border bg-popover px-3 py-2 text-[11px] text-text shadow-lg">
          {bubble}
        </div>
      ) : null}
      <button
        type="button"
        className="pointer-events-auto animate-pet-bob rounded-full border border-border bg-bg-card p-1.5 shadow-lg hover:border-primary/40"
        aria-label="Secbot 宠物"
        onClick={() => {
          setBubble(LINES[Math.floor(Math.random() * LINES.length)])
          window.setTimeout(() => setBubble(null), 2600)
        }}
      >
        <img src="/secbot-icon.png" alt="" className="h-12 w-12 object-contain" />
      </button>
    </div>
  )
}
