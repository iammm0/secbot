import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, getStoredTheme, watchSystemTheme } from './lib/theme'
import { isTauriRuntime, raiseMainWindow } from './lib/petWindow'
import './styles/globals.css'

type PetMsg =
  | { type: 'activity'; busy: boolean; phase?: string }
  | { type: 'theme' }
  | { type: 'speak'; text: string }

const CHANNEL = 'secbot-pet'
const DOUBLE_CLICK_MS = 300
const DRAG_THRESHOLD_PX = 4

function PetApp() {
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')
  const [bubble, setBubble] = useState<string | null>(null)
  const drag = useRef<{ ox: number; oy: number; moved: boolean } | null>(null)
  const clickTimer = useRef<number | null>(null)
  const justDragged = useRef(false)

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

  const speak = (text: string) => {
    setBubble(text)
    window.setTimeout(() => setBubble(null), 2400)
  }

  /** 双击打开主窗口设置（默认模型页）；单击则互动说话 */
  const handleTap = () => {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
      const ch = new BroadcastChannel(CHANNEL)
      ch.postMessage({ type: 'open-settings', tab: 'model' })
      ch.close()
      void raiseMainWindow()
      return
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      const lines = busy
        ? ['正在干活…', '脑子在冒烟。', '再等一下下。']
        : ['需要帮忙吗？', '授权范围内随时待命。', '点我不会咬人。']
      speak(lines[Math.floor(Math.random() * lines.length)])
    }, DOUBLE_CLICK_MS)
  }

  const startDrag = async (element: HTMLElement, pointerId: number) => {
    if (!isTauriRuntime()) return
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().startDragging()
    } catch {
      /* 原生拖拽不可用时保持原位，不打断交互 */
    } finally {
      try {
        element.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
    }
  }

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
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { ox: event.clientX, oy: event.clientY, moved: false }
          justDragged.current = false
        }}
        onPointerMove={(event) => {
          const state = drag.current
          if (!state || state.moved) return
          const dx = event.clientX - state.ox
          const dy = event.clientY - state.oy
          if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
            state.moved = true
            justDragged.current = true
            void startDrag(event.currentTarget, event.pointerId)
          }
        }}
        onPointerUp={() => {
          const wasDrag = drag.current?.moved ?? justDragged.current
          drag.current = null
          if (wasDrag) return
          handleTap()
        }}
        onPointerCancel={() => {
          drag.current = null
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
