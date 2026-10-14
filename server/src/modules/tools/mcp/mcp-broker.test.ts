import { describe, expect, it } from 'vitest';
import { PreferencesService } from '../../preferences/preferences.service';
import { McpServerConfig } from '../../preferences/preferences.types';
import { McpBroker } from './mcp-broker';
import { mcpVirtualToolName, truncateMcpDescription } from './mcp-names';
import { McpSessionFactory } from './mcp-session';

function prefs(servers: McpServerConfig[]): PreferencesService {
  return {
    listMcpServers: () => servers,
    getMcpServer: (idOrName: string) =>
      servers.find((item) => item.id === idOrName || item.name === idOrName) ?? null,
  } as PreferencesService;
}

const server: McpServerConfig = {
  id: 's1',
  name: 'Impacket Tools',
  command: 'python',
  args: ['server.py'],
};

describe('mcp tool names', () => {
  it('normalizes server and tool names into a stable virtual name', () => {
    expect(mcpVirtualToolName('Impacket Tools', 'SMB Enum')).toBe('mcp__impacket_tools__smb_enum');
    expect(truncateMcpDescription('Impacket Tools', 'x'.repeat(200)).length).toBeLessThanOrEqual(
      160,
    );
  });
});

describe('McpBroker', () => {
  it('exposes at most 24 sensitive tools', async () => {
    const factory: McpSessionFactory = {
      async connect() {
        return {
          async listTools() {
            return Array.from({ length: 25 }, (_, index) => ({
              name: `tool_${index + 1}`,
              description: `tool ${index + 1}`,
            }));
          },
          async callTool() {
            return { isError: false };
          },
          async close() {},
        };
      },
    };
    const broker = new McpBroker(prefs([server]), factory);
    const snapshot = await broker.refresh();
    const tools = broker.listTools();
    expect(tools).toHaveLength(24);
    expect(tools.every((tool) => tool.sensitive)).toBe(true);
    expect(tools[0]?.name).toBe('mcp__impacket_tools__tool_1');
    expect(snapshot.omitted).toBe(1);
    expect(snapshot.errors.some((item) => item.includes('已省略'))).toBe(true);
  });

  it('reconnects once when a call fails', async () => {
    let connects = 0;
    const factory: McpSessionFactory = {
      async connect() {
        connects += 1;
        const generation = connects;
        return {
          async listTools() {
            return [{ name: 'echo', description: 'Echo' }];
          },
          async callTool() {
            if (generation === 1) throw new Error('broken pipe');
            return { isError: false, content: 'ok' };
          },
          async close() {},
        };
      },
    };
    const broker = new McpBroker(prefs([server]), factory);
    await broker.refresh();
    const result = await broker.call('s1', 'echo', { text: 'hi' });
    expect(connects).toBe(2);
    expect(result.success).toBe(true);
  });

  it('does not reconnect a third time when the new session also fails', async () => {
    let connects = 0;
    const factory: McpSessionFactory = {
      async connect() {
        connects += 1;
        return {
          async listTools() {
            return [{ name: 'echo', description: 'Echo' }];
          },
          async callTool() {
            throw new Error('still down');
          },
          async close() {},
        };
      },
    };
    const broker = new McpBroker(prefs([server]), factory);
    await broker.refresh();
    const result = await broker.call('s1', 'echo', {});
    expect(connects).toBe(2);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain('still down');
  });
});
