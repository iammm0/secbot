import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PreferencesService } from '../../preferences/preferences.service';
import { McpServerConfig } from '../../preferences/preferences.types';
import { BaseTool, ToolResult } from '../core/base-tool';
import { wrapToolsForExecGoAudit } from '../control/audited-tool';
import { MCP_TOOL_CAP, mcpVirtualToolName, truncateMcpDescription } from './mcp-names';
import {
  McpRemoteToolInfo,
  McpSession,
  McpSessionFactory,
  StdioMcpSessionFactory,
} from './mcp-session';

const CONNECT_TIMEOUT_MS = 8_000;

export interface McpConnectionStatus {
  id: string;
  name: string;
  connected: boolean;
  tools: string[];
  error?: string;
}

export interface McpBrokerSnapshot {
  servers: McpConnectionStatus[];
  loaded_tools: string[];
  omitted: number;
  errors: string[];
}

interface HeldSession {
  fingerprint: string;
  session: McpSession;
}

const EMPTY_SNAPSHOT: McpBrokerSnapshot = {
  servers: [],
  loaded_tools: [],
  omitted: 0,
  errors: [],
};

function fingerprint(server: McpServerConfig): string {
  return JSON.stringify({
    command: server.command,
    args: server.args,
    cwd: server.cwd ?? '',
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 连接超时`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class McpRemoteTool extends BaseTool {
  constructor(
    private readonly broker: McpBroker,
    private readonly serverId: string,
    private readonly remoteName: string,
    name: string,
    description: string,
  ) {
    super(name, description, true);
  }

  run(params: Record<string, unknown>): Promise<ToolResult> {
    return this.broker.call(this.serverId, this.remoteName, params);
  }
}

@Injectable()
export class McpBroker implements OnModuleInit {
  private readonly logger = new Logger(McpBroker.name);
  private readonly sessions = new Map<string, HeldSession>();
  private remoteTools: BaseTool[] = [];
  private snapshot: McpBrokerSnapshot = EMPTY_SNAPSHOT;
  private refreshing: Promise<McpBrokerSnapshot> | null = null;

  constructor(
    private readonly preferences: PreferencesService,
    @Inject(StdioMcpSessionFactory) private readonly factory: McpSessionFactory,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh().catch((error) => {
      this.logger.warn(
        `MCP 目录刷新失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  listTools(): BaseTool[] {
    return this.remoteTools;
  }

  currentSnapshot(): McpBrokerSnapshot {
    return this.snapshot;
  }

  async refresh(): Promise<McpBrokerSnapshot> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refreshNow().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async call(
    serverId: string,
    remoteName: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const held = this.sessions.get(serverId);
    if (!held) {
      return { success: false, result: null, error: 'MCP 服务器未连接' };
    }
    try {
      return await this.invoke(held.session, remoteName, params);
    } catch (error) {
      const server = this.preferences.getMcpServer(serverId);
      if (!server) {
        return {
          success: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      try {
        const session = await this.connectFresh(server);
        return await this.invoke(session, remoteName, params);
      } catch (retryError) {
        return {
          success: false,
          result: null,
          error: retryError instanceof Error ? retryError.message : String(retryError),
        };
      }
    }
  }

  private async refreshNow(): Promise<McpBrokerSnapshot> {
    const servers = this.preferences.listMcpServers();
    const liveIds = new Set(servers.map((server) => server.id));
    for (const [id, held] of this.sessions) {
      if (liveIds.has(id)) continue;
      await held.session.close().catch(() => undefined);
      this.sessions.delete(id);
    }

    const connections = await Promise.all(servers.map((server) => this.refreshOne(server)));
    const errors: string[] = [];
    const built: BaseTool[] = [];
    const usedNames = new Set<string>();
    let omitted = 0;

    for (const connection of connections) {
      if (connection.error) errors.push(`${connection.name}: ${connection.error}`);
      for (const tool of connection.discovered) {
        if (built.length >= MCP_TOOL_CAP) {
          omitted += 1;
          continue;
        }
        const name = mcpVirtualToolName(connection.name, tool.name);
        if (usedNames.has(name)) {
          errors.push(`${connection.name}: 工具名冲突 ${name}`);
          continue;
        }
        usedNames.add(name);
        built.push(
          new McpRemoteTool(
            this,
            connection.id,
            tool.name,
            name,
            truncateMcpDescription(connection.name, tool.description ?? ''),
          ),
        );
      }
    }

    if (omitted > 0) {
      errors.push(`已省略 ${omitted} 个 MCP 工具（上限 ${MCP_TOOL_CAP}）`);
    }

    this.remoteTools = wrapToolsForExecGoAudit(built);
    const loadedNames = this.remoteTools.map((tool) => tool.name);
    const visible = new Set(loadedNames);
    this.snapshot = {
      servers: connections.map((connection) => ({
        id: connection.id,
        name: connection.name,
        connected: connection.connected,
        tools: connection.discovered
          .map((tool) => mcpVirtualToolName(connection.name, tool.name))
          .filter((name) => visible.has(name)),
        error: connection.error,
      })),
      loaded_tools: loadedNames,
      omitted,
      errors,
    };
    return this.snapshot;
  }

  private async refreshOne(server: McpServerConfig): Promise<{
    id: string;
    name: string;
    connected: boolean;
    discovered: McpRemoteToolInfo[];
    error?: string;
  }> {
    try {
      const session = await this.sessionFor(server);
      const discovered = await withTimeout(session.listTools(), CONNECT_TIMEOUT_MS, server.name);
      return { id: server.id, name: server.name, connected: true, discovered };
    } catch (error) {
      await this.dropSession(server.id);
      return {
        id: server.id,
        name: server.name,
        connected: false,
        discovered: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async sessionFor(server: McpServerConfig): Promise<McpSession> {
    const next = fingerprint(server);
    const held = this.sessions.get(server.id);
    if (held && held.fingerprint === next) return held.session;
    return this.connectFresh(server);
  }

  private async connectFresh(server: McpServerConfig): Promise<McpSession> {
    await this.dropSession(server.id);
    const session = await withTimeout(
      this.factory.connect(server),
      CONNECT_TIMEOUT_MS,
      server.name,
    );
    this.sessions.set(server.id, { fingerprint: fingerprint(server), session });
    return session;
  }

  private async dropSession(id: string): Promise<void> {
    const held = this.sessions.get(id);
    if (!held) return;
    this.sessions.delete(id);
    await held.session.close().catch(() => undefined);
  }

  private async invoke(
    session: McpSession,
    remoteName: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const result = await session.callTool(remoteName, params);
    const failed = Boolean(result.isError);
    return {
      success: !failed,
      result,
      error: failed ? 'MCP tool returned error' : undefined,
    };
  }
}
