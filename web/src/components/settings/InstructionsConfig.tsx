import { useEffect, useState } from 'react'
import { fetchSettings, saveInstructions } from '@/lib/settingsApi'

export function InstructionsConfig() {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void fetchSettings()
      .then(data => setText(data.custom_instructions ?? ''))
      .catch(err => setMessage(err instanceof Error ? err.message : '加载失败'))
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const data = await saveInstructions(text)
      setText(data.custom_instructions)
      setMessage('已保存，之后的对话会遵守这些指令')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-wider text-text-dim">个性化自定义指令</h3>
      <p className="text-[11px] leading-relaxed text-text-dim">
        写给模型的长期偏好，例如默认用中文、报告格式、授权范围、不要主动跑敏感工具等。每次对话都会注入。
      </p>
      <textarea
        value={text}
        onChange={event => setText(event.target.value)}
        rows={10}
        className="w-full resize-y rounded-lg border border-border bg-hover px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        placeholder={'例如：\n- 始终使用简体中文回复\n- 只在已授权目标上执行扫描\n- 报告先给结论，再给证据'}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-text-dim">{message}</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-xs text-primary disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存指令'}
        </button>
      </div>
    </div>
  )
}
