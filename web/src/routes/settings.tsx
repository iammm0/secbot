import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SettingsPanel } from '@/components/SettingsPanel'
import { SETTINGS_TABS, type SettingsTabId } from '@/lib/slashCommands'

type SettingsSearch = { tab?: SettingsTabId }

function parseTab(value: unknown): SettingsTabId {
  return typeof value === 'string' && (SETTINGS_TABS as readonly string[]).includes(value)
    ? (value as SettingsTabId)
    : 'model'
}

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: parseTab(search.tab),
  }),
  component: SettingsPage,
})

function SettingsPage() {
  const navigate = useNavigate()
  const { tab = 'model' } = Route.useSearch()

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <SettingsPanel
        tab={tab}
        onTabChange={(next) => {
          void navigate({ to: '/settings', search: { tab: next }, replace: true })
        }}
        onClose={() => {
          if (window.history.length > 1) {
            window.history.back()
            return
          }
          void navigate({ to: '/' })
        }}
      />
    </div>
  )
}
