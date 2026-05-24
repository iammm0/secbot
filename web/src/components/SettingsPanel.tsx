import { useState } from 'react'
import { ModelConfig } from './settings/ModelConfig'
import { ThemeConfig } from './settings/ThemeConfig'
import { HelpTools } from './settings/HelpTools'

interface Props {
  open: boolean
  onClose: () => void
}

const TABS = [
  { id: 'model', label: '模型配置' },
  { id: 'theme', label: '主题' },
  { id: 'help', label: '帮助与工具' },
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('model')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative glass-card w-full max-w-[560px] mx-4 max-h-[80vh] flex flex-col animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-mono text-primary font-semibold">设置</h2>
          <button onClick={onClose} className="text-text-dim hover:text-text text-lg leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                tab === t.id
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-text-dim hover:text-text hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'model' && <ModelConfig />}
          {tab === 'theme' && <ThemeConfig />}
          {tab === 'help' && <HelpTools />}
        </div>
      </div>
    </div>
  )
}
