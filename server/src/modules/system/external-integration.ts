/**
 * 外部集成：把 secbot 注册为 Claude Code / Codex 的 MCP 工具服务器，
 * 并提供 ACP（Agent Client Protocol）外部 agent 启动命令。
 *
 * 写的是用户本机的 claude/codex 配置文件，属于用户明确要求的动作；
 * 调用方（前端设置页）必须先经用户确认。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface ExternalClientStatus {
  claude_code: { installed: boolean; path?: string; mcp_registered: boolean };
  codex: { installed: boolean; path?: string; mcp_registered: boolean };
  /** 启动 secbot-mcp（外部工具）的命令描述 */
  secbot_command: { command: string; args: string[] };
  /** 启动 secbot-acp（外部 agent）的命令描述 */
  acp_command: { command: string; args: string[] };
}

export interface RegistrationResult {
  success: boolean;
  message: string;
}

function claudeJsonPath(home?: string): string {
  return path.join(home ?? os.homedir(), '.claude.json');
}

function codexConfigPath(home?: string): string {
  return path.join(home ?? os.homedir(), '.codex', 'config.toml');
}

/** 查找可执行文件（which 语义） */
function whichInPath(name: string): string | null {
  const envPath = process.env.PATH ?? '';
  for (const dir of envPath.split(':').filter(Boolean)) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* not here */
    }
  }
  return null;
}

/** 解析 secbot-mcp / secbot-acp 的启动方式：PATH 命令 > 仓库 bin > 桌面后端 dist > npx */
export function resolveLaunchSpec(binName: 'secbot-mcp' | 'secbot-acp'): {
  command: string;
  args: string[];
} {
  const onPath = whichInPath(binName);
  if (onPath) return { command: onPath, args: [] };

  // 本仓库开发场景：bin/<name>.js 需要 node 执行
  const repoBin = path.resolve(process.cwd(), 'bin', `${binName}.js`);
  if (fs.existsSync(repoBin)) {
    return { command: process.execPath, args: [repoBin] };
  }

  // 桌面端自包含后端布局：server/dist/{mcp-server,acp-server}.js
  const distEntry = binName === 'secbot-mcp' ? 'mcp-server.js' : 'acp-server.js';
  const distBin = path.resolve(process.cwd(), 'server', 'dist', distEntry);
  if (fs.existsSync(distBin)) {
    return { command: process.execPath, args: [distBin] };
  }

  return { command: 'npx', args: ['-y', binName] };
}

export async function detectExternalClients(home?: string): Promise<ExternalClientStatus> {
  const claudeCli = whichInPath('claude');
  const codexCli = whichInPath('codex');
  const secbotMcp = resolveLaunchSpec('secbot-mcp');
  const secbotAcp = resolveLaunchSpec('secbot-acp');

  let claudeMcpRegistered = false;
  try {
    const raw = JSON.parse(fs.readFileSync(claudeJsonPath(home), 'utf8')) as {
      mcpServers?: Record<string, unknown>;
    };
    claudeMcpRegistered = Boolean(
      raw.mcpServers && (raw.mcpServers.secbot || raw.mcpServers['secbot-mcp']),
    );
  } catch {
    claudeMcpRegistered = false;
  }

  let codexMcpRegistered = false;
  try {
    if (fs.existsSync(codexConfigPath(home))) {
      const text = fs.readFileSync(codexConfigPath(home), 'utf8');
      codexMcpRegistered = /\[mcp_servers\.secbot\]|\[mcp_servers\.secbot-mcp\]/i.test(text);
    }
  } catch {
    codexMcpRegistered = false;
  }

  return {
    claude_code: {
      installed: Boolean(claudeCli),
      path: claudeCli ?? undefined,
      mcp_registered: claudeMcpRegistered,
    },
    codex: {
      installed: Boolean(codexCli),
      path: codexCli ?? undefined,
      mcp_registered: codexMcpRegistered,
    },
    secbot_command: secbotMcp,
    acp_command: secbotAcp,
  };
}

/** 注册 MCP 服务器到 Claude Code（写入 ~/.claude.json 的 mcpServers） */
export async function registerClaudeCodeMcp(home?: string): Promise<RegistrationResult> {
  const spec = resolveLaunchSpec('secbot-mcp');
  try {
    const jsonPath = claudeJsonPath(home);
    const raw: { mcpServers?: Record<string, unknown> } = fs.existsSync(jsonPath)
      ? (JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { mcpServers?: Record<string, unknown> })
      : {};
    const servers = raw.mcpServers ?? {};
    servers.secbot = { type: 'stdio', command: spec.command, args: spec.args };
    raw.mcpServers = servers;
    fs.writeFileSync(jsonPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    return {
      success: true,
      message: `已注册到 Claude Code：${[spec.command, ...spec.args].join(' ')}（工具将以 mcp__secbot__* 形式出现）`,
    };
  } catch (error) {
    return { success: false, message: `写入 ~/.claude.json 失败：${String(error)}` };
  }
}

/** 注册 MCP 服务器到 Codex（追加到 ~/.codex/config.toml 的 [mcp_servers.secbot]） */
export async function registerCodexMcp(home?: string): Promise<RegistrationResult> {
  const spec = resolveLaunchSpec('secbot-mcp');
  try {
    const configPath = codexConfigPath(home);
    let text = '';
    if (fs.existsSync(configPath)) {
      text = fs.readFileSync(configPath, 'utf8');
      if (/\[mcp_servers\.secbot\]/i.test(text)) {
        return { success: true, message: 'Codex 已注册过 secbot MCP，无需重复配置' };
      }
    } else {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    const section = [
      '',
      '[mcp_servers.secbot]',
      `command = "${spec.command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
      spec.args.length > 0
        ? `args = [${spec.args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(', ')}]`
        : 'args = []',
      '',
    ].join('\n');
    text = text.endsWith('\n') ? text + section.trimStart() : text + '\n' + section.trimStart();
    fs.writeFileSync(configPath, text, 'utf8');
    return {
      success: true,
      message: '已注册到 Codex（~/.codex/config.toml 的 [mcp_servers.secbot]）',
    };
  } catch (error) {
    return { success: false, message: `写入 ~/.codex/config.toml 失败：${String(error)}` };
  }
}
