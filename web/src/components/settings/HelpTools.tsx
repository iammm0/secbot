import { useEffect, useState } from 'react'

interface Tool {
  name: string
  description: string
  category: string
}

interface Category {
  id: string
  name: string
  count: number
  tools: Tool[]
}

export function HelpTools() {
  const [categories, setCategories] = useState<Category[]>([])
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tools').then(r => r.json()).then(d => {
      setCategories(d.data?.categories ?? d.categories ?? [])
    })
  }, [])

  return (
    <div className="space-y-6">
      {/* 使用指南 */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-text-dim mb-3">使用指南</h3>
        <div className="space-y-2 text-xs text-text font-mono">
          <div className="flex gap-2">
            <span className="text-primary font-semibold w-16">Agent</span>
            <span className="text-text-dim">完整 ReAct 循环 — 自动执行工具、规划复杂任务</span>
          </div>
          <div className="flex gap-2">
            <span className="text-primary font-semibold w-16">Ask</span>
            <span className="text-text-dim">仅问答 — 不执行工具，快速获取答案</span>
          </div>
        </div>
      </div>

      {/* 工具列表 */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-text-dim mb-3">
          可用工具 <span className="text-primary">({categories.reduce((s, c) => s + c.count, 0)})</span>
        </h3>
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {categories.map(cat => (
            <div key={cat.id}>
              <button
                onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
              >
                <span className="text-xs text-white/30">{expandedCat === cat.id ? '▼' : '▶'}</span>
                <span className="text-xs font-mono text-secondary">{cat.name}</span>
                <span className="text-[10px] text-text-dim ml-auto">{cat.count}</span>
              </button>
              {expandedCat === cat.id && (
                <div className="ml-5 space-y-1 mb-2">
                  {cat.tools.map(tool => (
                    <div key={tool.name} className="px-2 py-1 rounded bg-white/3 border border-white/5">
                      <div className="text-xs font-mono text-primary">{tool.name}</div>
                      <div className="text-[11px] text-text-dim">{tool.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
