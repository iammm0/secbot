import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '@/components/Sidebar'

export const Route = createFileRoute('/_chat')({
  component: ChatLayout,
})

function ChatLayout() {
  return (
    <div className="flex h-full min-h-0">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
