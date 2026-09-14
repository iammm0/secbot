import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PreferencesService } from '../../preferences/preferences.service';
import { BaseTool, ToolResult } from '../core/base-tool';

const MCP_ACTIONS = new Set(['list_servers', 'list_tools', 'call_tool']);

export class McpCallTool extends BaseTool {
  constructor(private readonly preferences?: PreferencesService) {
    super(
      'mcp_call',
      'List or call tools from a saved MCP server (params.server) or an ad-hoc stdio command. Actions: list_servers, list_tools, call_tool.',
      true,
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const action = String(params.action ?? 'call_tool').trim();
    if (!MCP_ACTIONS.has(action)) {
      return { success: false, result: null, error: `Unsupported action: ${action}` };
    }

    if (action === 'list_servers') {
      const servers = this.preferences?.listMcpServers() ?? [];
      return {
        success: true,
        result: servers.map((server) => ({
          id: server.id,
          name: server.name,
          command: server.command,
          args: server.args,
          cwd: server.cwd ?? null,
        })),
      };
    }

    const resolved = this.resolveLaunch(params);
    if (!resolved.ok) {
      return { success: false, result: null, error: resolved.error };
    }

    const tool = String(params.tool ?? '').trim();
    const input = this.asRecord(params.input);

    let transport: StdioClientTransport | null = null;
    let client: Client | null = null;
    let stderr = '';

    try {
      transport = new StdioClientTransport({
        command: resolved.command,
        args: resolved.args,
        cwd: resolved.cwd,
        stderr: 'pipe',
      });
      const stderrStream = transport.stderr;
      if (stderrStream) {
        stderrStream.on('data', (chunk) => {
          stderr += chunk.toString();
        });
      }
      client = new Client({ name: 'secbot-mcp-bridge', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);

      if (action === 'list_tools') {
        const tools = await client.listTools();
        return { success: true, result: tools };
      }

      if (!tool) {
        return { success: false, result: null, error: 'Missing parameter: tool' };
      }

      const result = await client.callTool({ name: tool, arguments: input });
      return {
        success: !(result as { isError?: boolean }).isError,
        result,
        error: (result as { isError?: boolean }).isError ? 'MCP tool returned error' : undefined,
      };
    } catch (error) {
      return {
        success: false,
        result: stderr ? { stderr: stderr.trim() } : null,
        error: stderr ? `${(error as Error).message}\n${stderr.trim()}` : (error as Error).message,
      };
    } finally {
      await client?.close().catch(() => undefined);
      await transport?.close().catch(() => undefined);
    }
  }

  private resolveLaunch(params: Record<string, unknown>):
    | { ok: true; command: string; args: string[]; cwd?: string }
    | { ok: false; error: string } {
    const serverName = String(params.server ?? '').trim();
    if (serverName) {
      const saved = this.preferences?.getMcpServer(serverName);
      if (!saved) {
        return { ok: false, error: `Unknown MCP server: ${serverName}` };
      }
      return { ok: true, command: saved.command, args: saved.args, cwd: saved.cwd };
    }

    const command = String(params.command ?? '').trim();
    if (!command) {
      return {
        ok: false,
        error: 'Missing parameter: server or command. Add an MCP in Settings, or pass command=...',
      };
    }
    const args = Array.isArray(params.args) ? params.args.map(String) : [];
    const cwd = typeof params.cwd === 'string' ? params.cwd : undefined;
    return { ok: true, command, args, cwd };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }
}
