import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { SettingsPanel } from '@/components/SettingsPanel'
import { useSessionStore } from '@/hooks/useSessionStore'
import type { ChatMode } from '@/lib/types'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const { getMode, setMode } = useSessionStore()
  const [mode, setModeState] = useState<ChatMode>(getMode())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleModeChange = (m: ChatMode) => {
    setModeState(m)
    setMode(m)
  }

  return (
    <div className="h-full flex">
      <Sidebar mode={mode} onModeChange={handleModeChange} onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
