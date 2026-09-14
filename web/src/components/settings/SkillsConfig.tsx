import { type FormEvent, useEffect, useState } from 'react'
import { createSkill, deleteSkill, fetchSkills, type SkillSummary } from '@/lib/settingsApi'

export function SkillsConfig() {
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggers, setTriggers] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reload = async () => {
    setSkills(await fetchSkills())
  }

  useEffect(() => {
    void reload().catch(err => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await createSkill({
        name: name.trim(),
        description: description.trim() || undefined,
        triggers: triggers
          .split(/[,，]/)
          .map(item => item.trim())
          .filter(Boolean),
      })
      setName('')
      setDescription('')
      setTriggers('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-xs uppercase tracking-wider text-text-dim">技能</h3>
        <p className="text-[11px] leading-relaxed text-text-dim">
          技能是给 Agent 的可复用操作说明。内置技能不能删，自定义技能会写到 skills/custom。
        </p>
      </div>

      <div className="max-h-56 space-y-2 overflow-y-auto">
        {skills.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-dim">
            还没有技能
          </p>
        ) : (
          skills.map(skill => (
            <div key={skill.slug} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-hover px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-primary">{skill.name}</span>
                  <span className="rounded bg-border px-1.5 py-0.5 text-[10px] text-text-dim">{skill.scope}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-text-dim">{skill.description}</div>
              </div>
              {skill.scope === 'custom' ? (
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-text-dim hover:text-error"
                  onClick={() => {
                    void deleteSkill(skill.slug)
                      .then(() => reload())
                      .catch(err => setError(err instanceof Error ? err.message : '删除失败'))
                  }}
                >
                  删除
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={event => void submit(event)}>
        <div className="text-[11px] font-medium text-text">添加技能</div>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="名称，例如 report-style"
          className="w-full rounded border border-border bg-hover px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        />
        <input
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="简短说明"
          className="w-full rounded border border-border bg-hover px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        />
        <input
          value={triggers}
          onChange={event => setTriggers(event.target.value)}
          placeholder="触发词，逗号分隔"
          className="w-full rounded border border-border bg-hover px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        />
        {error ? <p className="text-[11px] text-error">{error}</p> : null}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-xs text-primary disabled:opacity-50"
          >
            {saving ? '添加中…' : '添加技能'}
          </button>
        </div>
      </form>
    </div>
  )
}
