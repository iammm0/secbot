import { Icon } from '@/components/Icon'
import { ModelConfig } from './settings/ModelConfig'
import { AppearanceConfig } from './settings/AppearanceConfig'
import { InstructionsConfig } from './settings/InstructionsConfig'
import { McpConfig } from './settings/McpConfig'
import { SkillsConfig } from './settings/SkillsConfig'
import { HelpTools } from './settings/HelpTools'
import { type SettingsTabId } from '@/lib/slashCommands'

interface Props {
  open: boolean
  tab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
  onClose: () => void
}

const TAB_META: Array<{ id: SettingsTabId; label: string; icon: string }> = [
  { id: 'model', label: '模型', icon: 'cpu' },
  { id: 'appearance', label: '外观', icon: 'colorfilter' },
  { id: 'instructions', label: '指令', icon: 'document-text' },
  { id: 'mcp', label: 'MCP', icon: 'hierarchy' },
  { id: 'skills', label: '技能', icon: 'code' },
  { id: 'help', label: '帮助', icon: 'info-circle' },
]

export function SettingsPanel({ open, tab, onTabChange, onClose }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 z-0 bg-overlay"
        aria-label="关闭设置"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[min(80vh,640px)] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl animate-fade-in-up">
        <nav className="flex w-36 shrink-0 flex-col gap-1 border-r border-border p-3">
          <div className="mb-2 px-2 font-mono text-sm font-semibold text-primary">设置</div>
          {TAB_META.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-xs transition-all ${
                tab === item.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-text-dim hover:bg-hover hover:text-text'
              }`}
            >
              <Icon name={item.icon} size={14} className="pointer-events-none" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-end border-b border-border px-4 py-3">
            <button type="button" onClick={onClose} className="text-text-dim hover:text-text" aria-label="关闭设置">
              <Icon name="close-circle" className="pointer-events-none" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {tab === 'model' && <ModelConfig />}
            {tab === 'appearance' && <AppearanceConfig />}
            {tab === 'instructions' && <InstructionsConfig />}
            {tab === 'mcp' && <McpConfig />}
            {tab === 'skills' && <SkillsConfig />}
            {tab === 'help' && <HelpTools />}
          </div>
        </div>
      </div>
    </div>
  )
}
