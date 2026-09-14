import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { McpServerConfig } from './preferences.types';

const INSTRUCTIONS_KEY = 'custom_instructions';
const MCP_KEY = 'mcp_servers';

@Injectable()
export class PreferencesService {
  constructor(private readonly database: DatabaseService) {}

  getCustomInstructions(): string {
    return (this.database.getConfig(INSTRUCTIONS_KEY)?.value ?? '').trim();
  }

  setCustomInstructions(text: string): string {
    const value = text.trim();
    this.database.saveConfig(INSTRUCTIONS_KEY, value, 'personalization', '用户自定义指令');
    return value;
  }

  listMcpServers(): McpServerConfig[] {
    const raw = this.database.getConfig(MCP_KEY)?.value;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => this.normalizeServer(item))
        .filter((item): item is McpServerConfig => item != null);
    } catch {
      return [];
    }
  }

  addMcpServer(input: { name: string; command: string; args?: string[]; cwd?: string }): McpServerConfig {
    const name = input.name.trim();
    const command = input.command.trim();
    if (!name) throw new BadRequestException('MCP 名称不能为空');
    if (!command) throw new BadRequestException('MCP 启动命令不能为空');
    const servers = this.listMcpServers();
    if (servers.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      throw new BadRequestException(`已存在同名 MCP：${name}`);
    }
    const server: McpServerConfig = {
      id: randomUUID(),
      name,
      command,
      args: (input.args ?? []).map((item) => String(item).trim()).filter(Boolean),
      cwd: input.cwd?.trim() || undefined,
    };
    this.saveMcpServers([...servers, server]);
    return server;
  }

  removeMcpServer(id: string): McpServerConfig {
    const servers = this.listMcpServers();
    const found = servers.find((item) => item.id === id);
    if (!found) throw new NotFoundException(`MCP 不存在：${id}`);
    this.saveMcpServers(servers.filter((item) => item.id !== id));
    return found;
  }

  getMcpServer(idOrName: string): McpServerConfig | null {
    const needle = idOrName.trim().toLowerCase();
    if (!needle) return null;
    return (
      this.listMcpServers().find(
        (item) => item.id === idOrName.trim() || item.name.toLowerCase() === needle,
      ) ?? null
    );
  }

  private saveMcpServers(servers: McpServerConfig[]): void {
    this.database.saveConfig(MCP_KEY, JSON.stringify(servers), 'mcp', '已保存的 MCP 服务器');
  }

  private normalizeServer(value: unknown): McpServerConfig | null {
    if (!value || typeof value !== 'object') return null;
    const rec = value as Record<string, unknown>;
    const name = String(rec.name ?? '').trim();
    const command = String(rec.command ?? '').trim();
    if (!name || !command) return null;
    const args = Array.isArray(rec.args) ? rec.args.map((item) => String(item).trim()).filter(Boolean) : [];
    const cwd = typeof rec.cwd === 'string' && rec.cwd.trim() ? rec.cwd.trim() : undefined;
    return {
      id: String(rec.id ?? randomUUID()),
      name,
      command,
      args,
      cwd,
    };
  }
}
