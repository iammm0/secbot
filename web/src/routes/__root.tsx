import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { SettingsPanel } from '@/components/SettingsPanel'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="h-full flex">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
