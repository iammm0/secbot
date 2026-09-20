import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, getStoredTheme, watchSystemTheme } from './lib/theme'
import './styles/globals.css'

type PetMsg =
  | { type: 'activity'; busy: boolean; phase?: string }
  | { type: 'theme' }
  | { type: 'speak'; text: string }

const CHANNEL = 'secbot-pet'

function PetApp() {
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')
  const [bubble, setBubble] = useState<string | null>(null)

  useEffect(() => {
    applyTheme(getStoredTheme())
    return watchSystemTheme()
  }, [])

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (event: MessageEvent<PetMsg>) => {
      const msg = event.data
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'activity') {
        setBusy(Boolean(msg.busy))
        setPhase(msg.phase ?? '')
      } else if (msg.type === 'theme') {
        applyTheme(getStoredTheme())
      } else if (msg.type === 'speak') {
        setBubble(msg.text)
        window.setTimeout(() => setBubble(null), 2400)
      }
    }
    return () => ch.close()
  }, [])

  return (
    <div className="flex h-full w-full flex-col items-center justify-end pb-1">
      {bubble ? (
        <div className="mb-1 max-w-[120px] rounded-md border border-border bg-popover/95 px-2 py-1 text-center text-[10px] text-text shadow">
          {bubble}
          {busy && phase ? (
            <div className="mt-0.5 truncate font-mono text-[9px] text-primary/80">{phase}</div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className={`pet-float ${busy ? 'pet-busy' : 'pet-idle'}`}
        aria-label="Secbot 宠物"
        data-tauri-drag-region
        onClick={() => {
          const lines = busy
            ? ['正在干活…', '脑子在冒烟。', '再等一下下。']
            : ['需要帮忙吗？', '授权范围内随时待命。', '点我不会咬人。']
          setBubble(lines[Math.floor(Math.random() * lines.length)])
          window.setTimeout(() => setBubble(null), 2400)
        }}
      >
        <img src="/secbot-pet.png" alt="" className="pet-sprite h-[88px] w-[88px] object-contain" draggable={false} />
        {busy ? (
          <>
            <span className="pet-ring" aria-hidden="true" />
            <span className="pet-cursor font-mono text-[10px] text-primary" aria-hidden="true">
              {'> _'}
            </span>
          </>
        ) : null}
      </button>
    </div>
  )
}

applyTheme(getStoredTheme())
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PetApp />
  </StrictMode>,
)
