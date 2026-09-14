import { type FormEvent, useEffect, useState } from 'react'
import { addMcpServer, fetchSettings, removeMcpServer, type McpServer } from '@/lib/settingsApi'

export function McpConfig() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [cwd, setCwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reload = async () => {
    const data = await fetchSettings()
    setServers(data.mcp_servers ?? [])
  }

  useEffect(() => {
    void reload().catch(err => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !command.trim()) return
    setSaving(true)
    setError('')
    try {
      const args = argsText
        .split(/\s+/)
        .map(item => item.trim())
        .filter(Boolean)
      await addMcpServer({ name: name.trim(), command: command.trim(), args, cwd: cwd.trim() || undefined })
      setName('')
      setCommand('')
      setArgsText('')
      setCwd('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-xs uppercase tracking-wider text-text-dim">MCP 服务器</h3>
        <p className="text-[11px] leading-relaxed text-text-dim">
          保存后，对话里可以用 <span className="font-mono text-primary">mcp_call</span> 的{' '}
          <span className="font-mono">server=名称</span> 调用。
        </p>
      </div>

      <div className="space-y-2">
        {servers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-dim">
            还没有 MCP，先在下面添加一个 stdio 服务
          </p>
        ) : (
          servers.map(server => (
            <div key={server.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-hover px-3 py-2">
              <div className="min-w-0">
                <div className="font-mono text-xs text-primary">{server.name}</div>
                <div className="truncate text-[11px] text-text-dim">
                  {server.command} {server.args.join(' ')}
                </div>
                {server.cwd ? <div className="truncate text-[11px] text-text-dim">cwd: {server.cwd}</div> : null}
              </div>
              <button
                type="button"
                className="shrink-0 text-[11px] text-text-dim hover:text-error"
                onClick={() => {
                  void removeMcpServer(server.id)
                    .then(() => reload())
                    .catch(err => setError(err instanceof Error ? err.message : '删除失败'))
                }}
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>

      <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={event => void submit(event)}>
        <div className="text-[11px] font-medium text-text">添加 MCP</div>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="名称，例如 filesystem"
          className="w-full rounded border border-border bg-hover px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        />
        <input
          value={command}
          onChange={event => setCommand(event.target.value)}
          placeholder="启动命令，例如 npx"
          className="w-full rounded border border-border bg-hover px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        />
        <input
          value={argsText}
          onChange={event => setArgsText(event.target.value)}
          placeholder="参数，空格分隔，例如 -y @modelcontextprotocol/server-filesystem /tmp"
          className="w-full rounded border border-border bg-hover px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        />
        <input
          value={cwd}
          onChange={event => setCwd(event.target.value)}
          placeholder="工作目录（可选）"
          className="w-full rounded border border-border bg-hover px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        />
        {error ? <p className="text-[11px] text-error">{error}</p> : null}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !name.trim() || !command.trim()}
            className="rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-xs text-primary disabled:opacity-50"
          >
            {saving ? '添加中…' : '添加 MCP'}
          </button>
        </div>
      </form>
    </div>
  )
}
