import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { SettingsPanel } from '@/components/SettingsPanel'
import { SecbotPet } from '@/components/SecbotPet'
import { SlashResultDialog } from '@/components/SlashResultDialog'
import {
  SETTINGS_EVENT,
  SLASH_EVENT,
  emitOpenSettings,
  type SettingsTabId,
  type SlashRun,
} from '@/lib/slashCommands'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('model')
  const [slashDialog, setSlashDialog] = useState<Extract<SlashRun, { kind: 'dialog' }> | null>(null)

  useEffect(() => {
    const onSettings = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: SettingsTabId }>).detail?.tab
      if (tab) setSettingsTab(tab)
      setSettingsOpen(true)
    }
    const onSlash = (event: Event) => {
      const run = (event as CustomEvent<SlashRun>).detail
      if (!run) return
      if (run.kind === 'settings') {
        emitOpenSettings(run.tab)
        return
      }
      if (run.kind === 'navigate') {
        void navigate({ to: run.to })
        return
      }
      setSlashDialog(run)
    }
    window.addEventListener(SETTINGS_EVENT, onSettings)
    window.addEventListener(SLASH_EVENT, onSlash)
    return () => {
      window.removeEventListener(SETTINGS_EVENT, onSettings)
      window.removeEventListener(SLASH_EVENT, onSlash)
    }
  }, [navigate])

  return (
    <div className="h-full flex">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <img
            src="/secbot-icon.png"
            alt=""
            className="bg-watermark absolute left-1/2 top-1/2 h-auto w-[min(92vmin,780px)] -translate-x-1/2 -translate-y-1/2 object-contain"
          />
        </div>
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
      <SettingsPanel
        open={settingsOpen}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        onClose={() => setSettingsOpen(false)}
      />
      {slashDialog ? (
        <SlashResultDialog title={slashDialog.title} load={slashDialog.load} onClose={() => setSlashDialog(null)} />
      ) : null}
      <SecbotPet />
    </div>
  )
}
