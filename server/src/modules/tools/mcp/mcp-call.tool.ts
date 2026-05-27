import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BaseTool, ToolResult } from '../core/base-tool';

const MCP_ACTIONS = new Set(['list_tools', 'call_tool']);

export class McpCallTool extends BaseTool {
  constructor() {
    super('mcp_call', 'List or call tools from an external MCP stdio server.', true);
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const command = String(params.command ?? '').trim();
    const action = String(params.action ?? 'call_tool').trim();
    const tool = String(params.tool ?? '').trim();
    const args = Array.isArray(params.args) ? params.args.map(String) : [];
    const cwd = typeof params.cwd === 'string' ? params.cwd : undefined;
    const input = this.asRecord(params.input);

    if (!command) {
      return { success: false, result: null, error: 'Missing parameter: command' };
    }
    if (!MCP_ACTIONS.has(action)) {
      return { success: false, result: null, error: `Unsupported action: ${action}` };
    }

    let transport: StdioClientTransport | null = null;
    let client: Client | null = null;
    let stderr = '';

    try {
      transport = new StdioClientTransport({
        command,
        args,
        cwd,
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

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }
}
