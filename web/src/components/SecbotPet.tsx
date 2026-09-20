import { useEffect, useRef, useState } from 'react'
import { getShowPet, PREFS_EVENT } from '@/lib/uiPrefs'
import { getTaskActivity, TASK_ACTIVITY_EVENT, type TaskActivityDetail } from '@/lib/taskActivity'
import {
  broadcastPet,
  closePetWindow,
  ensurePetWindow,
  isTauriRuntime,
} from '@/lib/petWindow'

const LINES_IDLE = ['需要帮忙吗？', '授权范围内随时待命。', '点我不会咬人。', '黑客绿还是浅色，你说了算。']
const LINES_BUSY = ['正在干活…', '脑子在冒烟。', '再等一下下。', '工具跑着呢。']

const POS_KEY = 'secbot-pet-pos'

type Pos = { x: number; y: number }

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Pos
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
  } catch {
    /* ignore */
  }
  return null
}

function clampPos(pos: Pos): Pos {
  const margin = 12
  const size = 96
  const maxX = Math.max(margin, window.innerWidth - size - margin)
  const maxY = Math.max(margin, window.innerHeight - size - margin)
  return {
    x: Math.min(maxX, Math.max(margin, pos.x)),
    y: Math.min(maxY, Math.max(margin, pos.y)),
  }
}

function defaultPos(): Pos {
  return clampPos({
    x: window.innerWidth - 112,
    y: window.innerHeight - 128,
  })
}

export function SecbotPet() {
  const [visible, setVisible] = useState(() => getShowPet())
  const [bubble, setBubble] = useState<string | null>(null)
  const [busy, setBusy] = useState(() => getTaskActivity().busy)
  const [phase, setPhase] = useState(() => getTaskActivity().phase ?? '')
  const [pos, setPos] = useState<Pos>(() => loadPos() ?? { x: -1, y: -1 })
  const [useOsWindow, setUseOsWindow] = useState(false)
  const posRef = useRef(pos)
  const drag = useRef<{ ox: number; oy: number; moved: boolean } | null>(null)

  useEffect(() => {
    posRef.current = pos
  }, [pos])

  useEffect(() => {
    const sync = () => setVisible(getShowPet())
    window.addEventListener(PREFS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PREFS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    const onActivity = (event: Event) => {
      const detail = (event as CustomEvent<TaskActivityDetail>).detail
      const nextBusy = Boolean(detail?.busy)
      const nextPhase = detail?.phase ?? ''
      setBusy(nextBusy)
      setPhase(nextPhase)
      broadcastPet({ type: 'activity', busy: nextBusy, phase: nextPhase })
    }
    window.addEventListener(TASK_ACTIVITY_EVENT, onActivity)
    return () => window.removeEventListener(TASK_ACTIVITY_EVENT, onActivity)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!visible) {
      void closePetWindow()
      setUseOsWindow(false)
      return
    }
    if (!isTauriRuntime()) {
      setUseOsWindow(false)
      return
    }
    void ensurePetWindow().then((ok) => {
      if (!cancelled) setUseOsWindow(ok)
      if (ok) {
        const activity = getTaskActivity()
        broadcastPet({ type: 'activity', busy: activity.busy, phase: activity.phase })
      }
    })
    return () => {
      cancelled = true
    }
  }, [visible])

  useEffect(() => {
    if (pos.x < 0) {
      setPos(defaultPos())
      return
    }
    const onResize = () => setPos((prev) => clampPos(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pos.x])

  // Desktop OS floating window handles the sprite; keep in-app fallback for web.
  if (!visible || useOsWindow) return null
  if (pos.x < 0) return null

  const speak = () => {
    const lines = busy ? LINES_BUSY : LINES_IDLE
    setBubble(lines[Math.floor(Math.random() * lines.length)])
    window.setTimeout(() => setBubble(null), 2600)
  }

  return (
    <div
      className="pointer-events-none fixed z-[90]"
      style={{ left: pos.x, top: pos.y, width: 96 }}
    >
      {bubble ? (
        <div className="pointer-events-none mb-2 max-w-44 -translate-x-1/4 rounded-lg border border-border bg-popover/95 px-3 py-2 text-[11px] text-text shadow-lg backdrop-blur-sm">
          {bubble}
          {busy && phase ? (
            <div className="mt-1 truncate font-mono text-[10px] text-primary/80">{phase}</div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className={`pet-float pointer-events-auto relative select-none ${
          busy ? 'pet-busy' : 'pet-idle'
        }`}
        aria-label="Secbot 宠物"
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            ox: event.clientX - pos.x,
            oy: event.clientY - pos.y,
            moved: false,
          }
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          const next = clampPos({
            x: event.clientX - drag.current.ox,
            y: event.clientY - drag.current.oy,
          })
          if (Math.abs(next.x - pos.x) > 2 || Math.abs(next.y - pos.y) > 2) {
            drag.current.moved = true
          }
          setPos(next)
        }}
        onPointerUp={() => {
          const wasDrag = drag.current?.moved
          drag.current = null
          try {
            localStorage.setItem(POS_KEY, JSON.stringify(posRef.current))
          } catch {
            /* ignore */
          }
          if (!wasDrag) speak()
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <img
          src="/secbot-pet.png"
          alt=""
          draggable={false}
          className="pet-sprite h-[84px] w-[84px] object-contain drop-shadow-[0_8px_18px_rgba(0,255,136,0.18)]"
        />
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
