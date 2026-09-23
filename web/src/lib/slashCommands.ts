import { readApi } from './api'

export const SETTINGS_TABS = ['model', 'jev', 'appearance', 'instructions', 'mcp', 'skills', 'execgo', 'audit', 'about', 'help'] as const
export type SettingsTabId = (typeof SETTINGS_TABS)[number]

export interface SlashCommand {
  slash: string
  title: string
  category: string
  kind?: 'api' | 'client'
  clients?: Array<'tui' | 'web' | 'desktop'>
}

export const HELP_TOOLS_TEXT = `SECBOT 集成的安全工具

【核心】
  port_scan      — 端口扫描
  service_detect — 服务识别
  vuln_scan      — 漏洞扫描
  recon          — 侦察信息收集

【网络】
  网络发现、目标管理、DNS/Whois/Ping/Traceroute、SSL 分析等

【防御】
  防御扫描、拦截状态、放行/报告

【Web】
  Web 扫描、爬虫、Web 研究

【其他】
  OSINT、协议探测、报告、云安全、系统命令等

【高级（仅 SuperHackbot，需确认）】
  attack_test    — 攻击测试
  exploit        — 漏洞利用

输入 / 可查看全部斜杠命令。`

export const SLASH_COMMANDS: SlashCommand[] = [
  { slash: '/help', title: '帮助（集成安全工具）', category: 'REST' },
  { slash: '/list-agents', title: '列出智能体', category: 'REST' },
  { slash: '/model', title: '模型配置', category: '设置' },
  { slash: '/jev', title: 'Jev 判断层', category: '设置' },
  { slash: '/tools', title: '内置工具', category: 'REST' },
  { slash: '/skills', title: '列出 Skills', category: 'REST' },
  { slash: '/skill', title: '查看 Skill 详情', category: 'REST' },
  { slash: '/create-skill', title: '创建 Skill', category: 'REST' },
  { slash: '/mcp', title: 'MCP 服务器', category: '设置' },
  { slash: '/execgo', title: 'ExecGo 运行时', category: '设置' },
  { slash: '/audit', title: '操作审计', category: '设置' },
  { slash: '/theme', title: '外观与主题', category: '设置' },
  { slash: '/instructions', title: '自定义指令', category: '设置' },
  { slash: '/new-session', title: '新建空白会话', category: '会话' },
  { slash: '/sessions', title: '最近会话', category: '会话' },
]

export type SlashRun =
  | { kind: 'settings'; tab: SettingsTabId }
  | { kind: 'navigate'; to: '/' }
  | { kind: 'dialog'; title: string; load: () => Promise<string> }

const OPEN_SETTINGS: Record<string, SettingsTabId> = {
  '/model': 'model',
  '/jev': 'jev',
  '/mcp': 'mcp',
  '/theme': 'appearance',
  '/instructions': 'instructions',
  '/execgo': 'execgo',
  '/audit': 'audit',
}

export function filterSlashCommands(input: string, catalog: SlashCommand[] = SLASH_COMMANDS): SlashCommand[] {
  if (!input.startsWith('/')) return []
  const token = input.split(/\s+/)[0] ?? input
  return catalog.filter(command => command.slash.startsWith(token.toLowerCase())).slice(0, 12)
}

export async function fetchCommandCatalog(client: 'web' | 'desktop' | 'tui' = 'web'): Promise<{
  commands: SlashCommand[]
  help_tools_text: string
}> {
  const response = await fetch(`/api/commands?client=${client}`)
  const data = await readApi<{ commands: SlashCommand[]; help_tools_text: string }>(response, '加载命令表失败')
  return {
    commands: data.commands?.length ? data.commands : SLASH_COMMANDS,
    help_tools_text: data.help_tools_text || HELP_TOOLS_TEXT,
  }
}

function parseFlags(parts: string[], flag: string): string[] {
  const values: string[] = []
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] !== flag) continue
    const segment: string[] = []
    let j = i + 1
    while (j < parts.length && !parts[j].startsWith('--')) {
      segment.push(parts[j])
      j += 1
    }
    if (segment.length) values.push(segment.join(' '))
    i = j - 1
  }
  return values
}

export function resolveSlash(input: string): SlashRun | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const parts = trimmed.split(/\s+/)
  const cmd = (parts[0] ?? '').toLowerCase()

  if (cmd === '/new-session' || cmd === '/sessions') {
    return { kind: 'navigate', to: '/' }
  }
  if (OPEN_SETTINGS[cmd]) {
    return { kind: 'settings', tab: OPEN_SETTINGS[cmd] }
  }
  if (cmd === '/create-skill' && !parts[1]) {
    return { kind: 'settings', tab: 'skills' }
  }
  if (cmd === '/skill' && !parts[1]) {
    return { kind: 'settings', tab: 'skills' }
  }

  if (cmd === '/help') {
    return {
      kind: 'dialog',
      title: 'SECBOT 帮助',
      load: async () => {
        try {
          const catalog = await fetchCommandCatalog('web')
          return catalog.help_tools_text
        } catch {
          return HELP_TOOLS_TEXT
        }
      },
    }
  }
  if (cmd === '/list-agents') {
    return {
      kind: 'dialog',
      title: '智能体列表',
      load: async () => {
        const response = await fetch('/api/agents')
        const data = await readApi<{ agents: Array<{ type: string; name: string; description: string }> }>(
          response,
          '加载智能体失败',
        )
        return (data.agents ?? []).map(agent => `${agent.type}: ${agent.name} — ${agent.description}`).join('\n') || '没有智能体'
      },
    }
  }
  if (cmd === '/tools') {
    return {
      kind: 'dialog',
      title: 'SECBOT 内置工具',
      load: async () => {
        const response = await fetch('/api/tools')
        const data = await readApi<{
          total: number
          basic_count: number
          advanced_count: number
          categories: Array<{ name: string; count: number; tools: Array<{ name: string; description: string }> }>
        }>(response, '加载工具失败')
        const lines = [
          `总计: ${data.total} 个（基础 ${data.basic_count}，高级 ${data.advanced_count}）`,
          '',
        ]
        for (const category of data.categories ?? []) {
          lines.push(`【${category.name}】${category.count} 个`)
          for (const tool of category.tools ?? []) {
            lines.push(`  ${tool.name.padEnd(22)} — ${tool.description}`)
          }
          lines.push('')
        }
        return lines.join('\n')
      },
    }
  }
  if (cmd === '/skills') {
    return {
      kind: 'dialog',
      title: 'Skills 列表',
      load: async () => {
        const response = await fetch('/api/skills')
        const data = await readApi<{ skills: Array<{ slug: string; description: string; scope: string }> }>(
          response,
          '加载技能失败',
        )
        const lines = ['SECBOT Skills', '']
        for (const skill of data.skills ?? []) {
          lines.push(`${skill.slug} [${skill.scope}] — ${skill.description}`)
        }
        return lines.join('\n') || '还没有技能'
      },
    }
  }
  if (cmd === '/skill') {
    const name = parts[1]?.trim()
    return {
      kind: 'dialog',
      title: name ? `Skill ${name}` : 'Skill',
      load: async () => {
        if (!name) return '用法: /skill <name>'
        const response = await fetch(`/api/skills/${encodeURIComponent(name)}`)
        const skill = await readApi<{
          slug: string
          description: string
          body: string
          triggers: string[]
          tags: string[]
        }>(response, '加载技能失败')
        return [
          `# ${skill.slug}`,
          '',
          skill.description,
          '',
          `triggers: ${(skill.triggers ?? []).join(', ')}`,
          `tags: ${(skill.tags ?? []).join(', ')}`,
          '',
          skill.body,
        ].join('\n')
      },
    }
  }
  if (cmd === '/create-skill') {
    const name = parts[1]?.trim()
    return {
      kind: 'dialog',
      title: '创建 Skill',
      load: async () => {
        if (!name) return '用法: /create-skill <name> [--description 文本] [--trigger xxx] [--tag xxx]'
        const response = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: parseFlags(parts, '--description')[0],
            tags: parseFlags(parts, '--tag'),
            triggers: parseFlags(parts, '--trigger'),
          }),
        })
        const created = await readApi<{ slug: string; relativeDir: string; description: string }>(response, '创建技能失败')
        return `已创建 skill ${created.slug}\n路径: ${created.relativeDir}\n描述: ${created.description}`
      },
    }
  }

  return null
}

export const SLASH_EVENT = 'secbot-slash'
export const SETTINGS_EVENT = 'secbot-open-settings'

export function emitSlash(run: SlashRun) {
  window.dispatchEvent(new CustomEvent(SLASH_EVENT, { detail: run }))
}

export function emitOpenSettings(tab: SettingsTabId) {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: { tab } }))
}
