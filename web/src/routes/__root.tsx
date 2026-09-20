import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { SecbotPet } from '@/components/SecbotPet'
import { SlashResultDialog } from '@/components/SlashResultDialog'
import { UpdateBanner } from '@/components/UpdateBanner'
import {
  SETTINGS_EVENT,
  SLASH_EVENT,
  type SettingsTabId,
  type SlashRun,
} from '@/lib/slashCommands'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const navigate = useNavigate()
  const [slashDialog, setSlashDialog] = useState<Extract<SlashRun, { kind: 'dialog' }> | null>(null)

  useEffect(() => {
    const openSettings = (tab: SettingsTabId = 'model') => {
      void navigate({ to: '/settings', search: { tab } })
    }
    const onSettings = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: SettingsTabId }>).detail?.tab
      openSettings(tab ?? 'model')
    }
    const onSlash = (event: Event) => {
      const run = (event as CustomEvent<SlashRun>).detail
      if (!run) return
      if (run.kind === 'settings') {
        openSettings(run.tab)
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <UpdateBanner />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
      {slashDialog ? (
        <SlashResultDialog title={slashDialog.title} load={slashDialog.load} onClose={() => setSlashDialog(null)} />
      ) : null}
      <SecbotPet />
    </div>
  )
}
