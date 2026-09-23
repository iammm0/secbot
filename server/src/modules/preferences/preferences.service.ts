import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { McpServerConfig } from './preferences.types';
import {
  applyExecGoEnv,
  defaultExecGoRuntimeConfig,
  setExecGoRuntimeConfig,
  type ExecGoRuntimeConfig,
} from '../tools/control/execgo-config';
import {
  createJevClient,
  defaultJevRuntimeConfig,
  JEV_PROBE_STATE,
  setJevRuntimeConfig,
  toPublicJevConfig,
  type JevPublicConfig,
  type JevRuntimeConfig,
} from '../../common/jev';
import {
  resolveExecGoCliPath,
  resolveExecGoRuntimePath,
  resolveExecGoServerPath,
  resolveSiblingExecGoRoot,
  resolveSiblingExecGoRuntimeRoot,
} from '../tools/control/execgo-paths';
import { ExecGoClient } from '../tools/control/execgo-client';
import {
  execGoProcessManager,
  type ManagedProcessStatus,
} from '../tools/control/execgo-process-manager';

const INSTRUCTIONS_KEY = 'custom_instructions';
const MCP_KEY = 'mcp_servers';
const EXECGO_KEY = 'execgo_runtime';
const JEV_KEY = 'jev_runtime';

@Injectable()
export class PreferencesService implements OnModuleInit {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    this.loadExecGoIntoRuntime();
    this.loadJevIntoRuntime();
    const config = this.getExecGoConfig();
    if (config.enabled) {
      void this.syncManagedProcesses(true).catch((error) => {
        this.logger.warn(
          `auto-start ExecGo processes failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }

  getCustomInstructions(): string {
    return (this.database.getConfig(INSTRUCTIONS_KEY)?.value ?? '').trim();
  }

  setCustomInstructions(text: string): string {
    const value = text.trim();
    this.database.saveConfig(INSTRUCTIONS_KEY, value, 'personalization', '用户自定义指令');
    return value;
  }

  getExecGoConfig(): ExecGoRuntimeConfig {
    const stored = this.readStoredExecGo();
    return setExecGoRuntimeConfig({
      ...defaultExecGoRuntimeConfig(),
      ...stored,
      cliPath: resolveExecGoCliPath(stored.cliPath || defaultExecGoRuntimeConfig().cliPath),
    });
  }

  async setExecGoConfig(input: Partial<ExecGoRuntimeConfig>): Promise<{
    config: ExecGoRuntimeConfig;
    processes: ManagedProcessStatus[];
    process_errors: string[];
  }> {
    const current = this.getExecGoConfig();
    const next = setExecGoRuntimeConfig({
      enabled: input.enabled ?? current.enabled,
      auditActions: input.auditActions ?? current.auditActions,
      fallbackLocal: input.fallbackLocal ?? current.fallbackLocal,
      url: input.url ?? current.url,
      runtimeUrl: input.runtimeUrl ?? current.runtimeUrl,
      cliPath: resolveExecGoCliPath(input.cliPath ?? current.cliPath),
    });
    this.database.saveConfig(EXECGO_KEY, JSON.stringify(next), 'execgo', 'ExecGo 运行时插件');
    applyExecGoEnv(next);

    const processResult = await this.syncManagedProcesses(next.enabled);
    return {
      config: next,
      processes: processResult.processes,
      process_errors: processResult.errors,
    };
  }

  async probeExecGo(): Promise<{
    config: ExecGoRuntimeConfig;
    sibling_root: string | null;
    runtime_sibling_root: string | null;
    cli_path: string;
    server_binary: string | null;
    runtime_binary: string | null;
    healthy: boolean;
    health?: Record<string, unknown>;
    processes: ManagedProcessStatus[];
    error?: string;
  }> {
    const config = this.getExecGoConfig();
    const cliPath = resolveExecGoCliPath(config.cliPath);
    const siblingRoot = resolveSiblingExecGoRoot();
    const runtimeSiblingRoot = resolveSiblingExecGoRuntimeRoot();
    const processes = execGoProcessManager.status();
    try {
      const health = await new ExecGoClient(cliPath).health(8_000);
      return {
        config: { ...config, cliPath },
        sibling_root: siblingRoot,
        runtime_sibling_root: runtimeSiblingRoot,
        cli_path: cliPath,
        server_binary: resolveExecGoServerPath(),
        runtime_binary: resolveExecGoRuntimePath(),
        healthy: true,
        health,
        processes,
      };
    } catch (error) {
      return {
        config: { ...config, cliPath },
        sibling_root: siblingRoot,
        runtime_sibling_root: runtimeSiblingRoot,
        cli_path: cliPath,
        server_binary: resolveExecGoServerPath(),
        runtime_binary: resolveExecGoRuntimePath(),
        healthy: false,
        processes,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getJevConfig(): JevRuntimeConfig {
    const stored = this.readStoredJev();
    return setJevRuntimeConfig({
      ...defaultJevRuntimeConfig(),
      ...stored,
    });
  }

  getJevPublicConfig(): JevPublicConfig {
    return toPublicJevConfig(this.getJevConfig());
  }

  getJevSettings(): { config: JevPublicConfig } {
    return { config: this.getJevPublicConfig() };
  }

  setJevConfig(input: Partial<JevRuntimeConfig> & { apiKey?: string }): {
    config: JevPublicConfig;
  } {
    const current = this.getJevConfig();
    const next = setJevRuntimeConfig({
      enabled: input.enabled ?? current.enabled,
      intent: input.intent ?? current.intent,
      qaLive: input.qaLive ?? current.qaLive,
      adaptive: input.adaptive ?? current.adaptive,
      reactStop: input.reactStop ?? current.reactStop,
      context: input.context ?? current.context,
      apiKey: input.apiKey?.trim() ? input.apiKey.trim() : current.apiKey,
      baseUrl: input.baseUrl ?? current.baseUrl,
      model: input.model ?? current.model,
      confidenceMin: input.confidenceMin ?? current.confidenceMin,
      reactStopMin: input.reactStopMin ?? current.reactStopMin,
    });
    this.database.saveConfig(JEV_KEY, JSON.stringify(next), 'jev', 'Jev System One 判断层');
    return { config: toPublicJevConfig(next) };
  }

  async probeJev(): Promise<{
    config: JevPublicConfig;
    healthy: boolean;
    noul?: number;
    model?: string;
    error?: string;
  }> {
    const config = this.getJevConfig();
    const publicConfig = toPublicJevConfig(config);
    if (!config.apiKey) {
      return { config: publicConfig, healthy: false, error: '尚未配置 TypeSafe API Key' };
    }
    try {
      const result = await createJevClient().systemOne({
        state: JEV_PROBE_STATE,
        questions: {
          urgency: {
            type: 'noul',
            instructions: 'Does this message express urgency?',
          },
        },
      });
      const answer = result.answers.urgency;
      const noul = answer && answer.type === 'noul' ? answer.noul : undefined;
      return {
        config: publicConfig,
        healthy: typeof noul === 'number',
        noul,
        model: result.model,
      };
    } catch (error) {
      return {
        config: publicConfig,
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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

  addMcpServer(input: {
    name: string;
    command: string;
    args?: string[];
    cwd?: string;
  }): McpServerConfig {
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

  private async syncManagedProcesses(enabled: boolean): Promise<{
    processes: ManagedProcessStatus[];
    errors: string[];
  }> {
    if (enabled) {
      const result = await execGoProcessManager.startManaged();
      return { processes: result.started, errors: result.errors };
    }
    const result = await execGoProcessManager.stopManaged();
    return {
      processes: execGoProcessManager.status(),
      errors: result.errors,
    };
  }

  private loadExecGoIntoRuntime(): void {
    const stored = this.readStoredExecGo();
    const next = setExecGoRuntimeConfig({
      ...defaultExecGoRuntimeConfig(),
      ...stored,
      cliPath: resolveExecGoCliPath(stored.cliPath || defaultExecGoRuntimeConfig().cliPath),
    });
    applyExecGoEnv(next);
  }

  private loadJevIntoRuntime(): void {
    const stored = this.readStoredJev();
    setJevRuntimeConfig({
      ...defaultJevRuntimeConfig(),
      ...stored,
    });
  }

  private readStoredExecGo(): Partial<ExecGoRuntimeConfig> {
    const raw = this.database.getConfig(EXECGO_KEY)?.value;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Partial<ExecGoRuntimeConfig>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private readStoredJev(): Partial<JevRuntimeConfig> {
    const raw = this.database.getConfig(JEV_KEY)?.value;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Partial<JevRuntimeConfig>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
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
    const args = Array.isArray(rec.args)
      ? rec.args.map((item) => String(item).trim()).filter(Boolean)
      : [];
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
