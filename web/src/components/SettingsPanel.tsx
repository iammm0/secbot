import { Icon } from '@/components/Icon'
import { ModelConfig } from './settings/ModelConfig'
import { AppearanceConfig } from './settings/AppearanceConfig'
import { InstructionsConfig } from './settings/InstructionsConfig'
import { McpConfig } from './settings/McpConfig'
import { SkillsConfig } from './settings/SkillsConfig'
import { ExecGoConfig } from './settings/ExecGoConfig'
import { AuditConfig } from './settings/AuditConfig'
import { HelpTools } from './settings/HelpTools'
import { AboutConfig } from './settings/AboutConfig'
import { JevConfig } from './settings/JevConfig'
import { type SettingsTabId } from '@/lib/slashCommands'

interface Props {
  tab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
  onClose: () => void
}

const TAB_META: Array<{ id: SettingsTabId; label: string; icon: string }> = [
  { id: 'model', label: '模型', icon: 'cpu' },
  { id: 'jev', label: 'Jev', icon: 'setting-2' },
  { id: 'appearance', label: '外观', icon: 'colorfilter' },
  { id: 'instructions', label: '指令', icon: 'document-text' },
  { id: 'mcp', label: 'MCP', icon: 'hierarchy' },
  { id: 'skills', label: '技能', icon: 'code' },
  { id: 'execgo', label: 'ExecGo', icon: 'global' },
  { id: 'audit', label: '审计', icon: 'row-vertical' },
  { id: 'about', label: '关于', icon: 'monitor' },
  { id: 'help', label: '帮助', icon: 'info-circle' },
]

export function SettingsPanel({ tab, onTabChange, onClose }: Props) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-border p-3">
        <div className="mb-3 flex items-center justify-between px-2">
          <div className="font-mono text-sm font-semibold text-primary">设置</div>
          <button type="button" onClick={onClose} className="text-text-dim hover:text-text" aria-label="返回">
            <Icon name="arrow-left" size={16} className="pointer-events-none" />
          </button>
        </div>
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto w-full max-w-3xl">
            {tab === 'model' && <ModelConfig />}
            {tab === 'jev' && <JevConfig />}
            {tab === 'appearance' && <AppearanceConfig />}
            {tab === 'instructions' && <InstructionsConfig />}
            {tab === 'mcp' && <McpConfig />}
            {tab === 'skills' && <SkillsConfig />}
            {tab === 'execgo' && <ExecGoConfig />}
            {tab === 'audit' && <AuditConfig />}
            {tab === 'about' && <AboutConfig />}
            {tab === 'help' && <HelpTools />}
          </div>
        </div>
      </div>
    </div>
  )
}
