export type CommandClient = 'tui' | 'web' | 'desktop';
export type CommandKind = 'api' | 'client';

export interface CommandCatalogItem {
  slash: string;
  title: string;
  category: string;
  kind: CommandKind;
  clients: CommandClient[];
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

输入 / 可查看全部斜杠命令。`;

export const COMMAND_CATALOG: CommandCatalogItem[] = [
  {
    slash: '/help',
    title: '帮助（集成安全工具）',
    category: 'REST',
    kind: 'api',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/list-agents',
    title: '列出智能体',
    category: 'REST',
    kind: 'api',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/model',
    title: '模型配置',
    category: '设置',
    kind: 'client',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/jev',
    title: 'Jev 判断层',
    category: '设置',
    kind: 'client',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/tools',
    title: '内置工具',
    category: 'REST',
    kind: 'api',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/skills',
    title: '列出 Skills',
    category: 'REST',
    kind: 'api',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/skill',
    title: '查看 Skill 详情',
    category: 'REST',
    kind: 'api',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/create-skill',
    title: '创建 Skill',
    category: 'REST',
    kind: 'api',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/mcp',
    title: 'MCP 服务器',
    category: '设置',
    kind: 'client',
    clients: ['web', 'desktop'],
  },
  {
    slash: '/theme',
    title: '外观与主题',
    category: '设置',
    kind: 'client',
    clients: ['web', 'desktop'],
  },
  {
    slash: '/instructions',
    title: '自定义指令',
    category: '设置',
    kind: 'client',
    clients: ['web', 'desktop'],
  },
  {
    slash: '/new-session',
    title: '新建空白会话',
    category: '会话',
    kind: 'client',
    clients: ['tui', 'web', 'desktop'],
  },
  {
    slash: '/sessions',
    title: '最近会话',
    category: '会话',
    kind: 'client',
    clients: ['tui', 'web', 'desktop'],
  },
  { slash: '/agent', title: '切换智能体', category: '会话', kind: 'client', clients: ['tui'] },
  { slash: '/log-level', title: '日志级别', category: '设置', kind: 'client', clients: ['tui'] },
  { slash: '/logs', title: '查看日志', category: '设置', kind: 'client', clients: ['tui'] },
  { slash: '/tasks', title: '当前任务', category: '会话', kind: 'client', clients: ['tui'] },
];
