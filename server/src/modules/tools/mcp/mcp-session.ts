import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServerConfig } from '../../preferences/preferences.types';

export interface McpRemoteToolInfo {
  name: string;
  description?: string;
}

export interface McpSession {
  listTools(): Promise<McpRemoteToolInfo[]>;
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ isError?: boolean; content?: unknown }>;
  close(): Promise<void>;
}

export interface McpSessionFactory {
  connect(server: McpServerConfig): Promise<McpSession>;
}

@Injectable()
export class StdioMcpSessionFactory implements McpSessionFactory {
  async connect(server: McpServerConfig): Promise<McpSession> {
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      stderr: 'pipe',
    });
    const client = new Client(
      { name: 'secbot-mcp-broker', version: '1.0.0' },
      { capabilities: {} },
    );
    await client.connect(transport);
    return {
      async listTools() {
        const listed = await client.listTools();
        const tools = Array.isArray(listed.tools) ? listed.tools : [];
        return tools
          .map((tool) => ({
            name: String(tool.name ?? '').trim(),
            description: tool.description ? String(tool.description) : undefined,
          }))
          .filter((tool) => tool.name.length > 0);
      },
      async callTool(name, args) {
        const result = await client.callTool({ name, arguments: args });
        return result as { isError?: boolean; content?: unknown };
      },
      async close() {
        await client.close().catch(() => undefined);
        await transport.close().catch(() => undefined);
      },
    };
  }
}
