import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  detectExternalClients,
  registerClaudeCodeMcp,
  registerCodexMcp,
  resolveLaunchSpec,
} from './external-integration';

const tmpDirs: string[] = [];

function makeHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secbot-ext-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('external-integration', () => {
  it('resolveLaunchSpec prefers a PATH binary when present', () => {
    // 本仓库存在 bin/secbot-mcp.js，在 PATH 无该命令时应解析为 node + 仓库脚本
    const spec = resolveLaunchSpec('secbot-mcp');
    expect(spec.command.length).toBeGreaterThan(0);
    expect(Array.isArray(spec.args)).toBe(true);
  });

  it('detectExternalClients reports no registrations on a clean home', async () => {
    const home = makeHome();
    const status = await detectExternalClients(home);
    expect(status.claude_code.mcp_registered).toBe(false);
    expect(status.codex.mcp_registered).toBe(false);
    expect(status.secbot_command.command.length).toBeGreaterThan(0);
    expect(status.acp_command.command.length).toBeGreaterThan(0);
  });

  it('registerClaudeCodeMcp writes mcpServers.secbot into ~/.claude.json', async () => {
    const home = makeHome();
    fs.mkdirSync(path.dirname(path.join(home, '.claude.json')), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ theme: 'dark' }), 'utf8');

    const result = await registerClaudeCodeMcp(home);
    expect(result.success).toBe(true);

    const raw = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')) as {
      mcpServers?: Record<string, unknown>;
      theme?: string;
    };
    // 保留原有内容
    expect(raw.theme).toBe('dark');
    const entry = raw.mcpServers?.secbot as { type?: string; command?: string; args?: unknown[] };
    expect(entry.type).toBe('stdio');
    expect(typeof entry.command).toBe('string');
    expect(Array.isArray(entry.args)).toBe(true);

    const status = await detectExternalClients(home);
    expect(status.claude_code.mcp_registered).toBe(true);
  });

  it('registerCodexMcp appends [mcp_servers.secbot] and is idempotent', async () => {
    const home = makeHome();
    const configPath = path.join(home, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, 'model = "deepseek-v4"\n', 'utf8');

    const first = await registerCodexMcp(home);
    expect(first.success).toBe(true);
    const text = fs.readFileSync(configPath, 'utf8');
    expect(text).toContain('[mcp_servers.secbot]');
    expect(text).toContain('command = "');
    // 保留原有行
    expect(text).toContain('model = "deepseek-v4"');

    const second = await registerCodexMcp(home);
    expect(second.success).toBe(true);
    const count = (fs.readFileSync(configPath, 'utf8').match(/\[mcp_servers\.secbot\]/g) ?? [])
      .length;
    expect(count).toBe(1);

    const status = await detectExternalClients(home);
    expect(status.codex.mcp_registered).toBe(true);
  });
});
