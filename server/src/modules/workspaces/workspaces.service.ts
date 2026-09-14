import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { NetworkService } from '../network/network.service';
import { AddWorkspaceNodeDto, type WorkspaceNodeKind } from './dto/workspaces.dto';
import { InvalidNodeAddressError, parseSecbotOrigin, parseSshHost } from './secbot-origin';

export const DEFAULT_WORKSPACE_ID = 'local';
export const LOCAL_NODE_ID = 'local-host';

const PROBE_TIMEOUT_MS = 4_000;

export interface WorkspaceNodeView {
  id: string;
  workspaceId: string;
  name: string;
  kind: WorkspaceNodeKind;
  address: string;
  status: 'unknown' | 'online' | 'offline';
  createdAt: string;
  hostname?: string;
  error?: string;
}

export interface WorkspaceView {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: WorkspaceNodeView[];
  sessionIds: string[];
}

@Injectable()
export class WorkspacesService implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly network: NetworkService,
  ) {}

  onModuleInit() {
    this.ensureDefaultWorkspace();
  }

  list(): WorkspaceView[] {
    this.ensureDefaultWorkspace();
    const workspaces = this.db.listWorkspaces();
    const nodes = this.db.listWorkspaceNodes();
    const sessions = this.db.listAllWorkspaceSessions();
    return workspaces.map((ws) => ({
      ...ws,
      nodes: nodes
        .filter((node) => node.workspaceId === ws.id)
        .map((node) => this.toNodeView(node)),
      sessionIds: sessions
        .filter((item) => item.workspaceId === ws.id)
        .map((item) => item.sessionId),
    }));
  }

  create(name: string): WorkspaceView {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('工作空间名称不能为空');
    const id = `ws_${randomUUID().slice(0, 10)}`;
    this.db.upsertWorkspace(id, trimmed);
    return this.requireWorkspace(id);
  }

  rename(id: string, name: string): WorkspaceView {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('工作空间名称不能为空');
    if (!this.db.renameWorkspace(id, trimmed)) {
      throw new NotFoundException(`工作空间不存在: ${id}`);
    }
    return this.requireWorkspace(id);
  }

  remove(id: string): { ok: true } {
    if (id === DEFAULT_WORKSPACE_ID) {
      throw new BadRequestException('不能删除本机工作空间');
    }
    if (!this.db.getWorkspace(id)) {
      throw new NotFoundException(`工作空间不存在: ${id}`);
    }
    this.db.reassignWorkspaceSessions(id, DEFAULT_WORKSPACE_ID);
    this.db.deleteWorkspace(id);
    return { ok: true };
  }

  addNode(workspaceId: string, body: AddWorkspaceNodeDto): Promise<WorkspaceNodeView> {
    if (!this.db.getWorkspace(workspaceId)) {
      throw new NotFoundException(`工作空间不存在: ${workspaceId}`);
    }
    const id = `nd_${randomUUID().slice(0, 10)}`;
    try {
      if (body.kind === 'secbot') {
        const origin = parseSecbotOrigin(body.address);
        this.db.upsertWorkspaceNode({
          id,
          workspaceId,
          name: body.name.trim(),
          kind: 'secbot',
          address: origin,
          status: 'unknown',
        });
      } else {
        const { host, port } = parseSshHost(body.address);
        this.db.upsertWorkspaceNode({
          id,
          workspaceId,
          name: body.name.trim(),
          kind: 'ssh',
          address: port === 22 ? host : `${host}:${port}`,
          status: 'unknown',
          meta: JSON.stringify({
            host,
            port,
            username: body.username ?? '',
          }),
        });
      }
    } catch (error) {
      if (error instanceof InvalidNodeAddressError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    return this.connectNode(workspaceId, id, body);
  }

  async connectNode(
    workspaceId: string,
    nodeId: string,
    creds?: Pick<AddWorkspaceNodeDto, 'username' | 'password' | 'keyFile'>,
  ): Promise<WorkspaceNodeView> {
    const node = this.db.getWorkspaceNode(nodeId);
    if (!node || node.workspaceId !== workspaceId) {
      throw new NotFoundException('主机节点不存在');
    }
    if (node.kind === 'local') {
      this.refreshLocalNode();
      return this.toNodeView(this.db.getWorkspaceNode(nodeId)!);
    }
    if (node.kind === 'secbot') {
      const probed = await this.probeSecbot(node.address);
      const meta = JSON.stringify({ hostname: probed.hostname ?? '', error: probed.error ?? '' });
      this.db.updateWorkspaceNodeStatus(nodeId, probed.ok ? 'online' : 'offline', meta);
      return this.toNodeView(this.db.getWorkspaceNode(nodeId)!);
    }

    const meta = this.readMeta(node.meta);
    const host = String(meta.host ?? parseSshHost(node.address).host);
    const username = (creds?.username || String(meta.username ?? '')).trim();
    if (!username) {
      throw new BadRequestException('SSH 节点需要用户名');
    }
    await this.network.authorize({
      targetIp: host,
      username,
      password: creds?.password,
      keyFile: creds?.keyFile,
      authType: 'full',
      description: `workspace ${workspaceId}`,
    });
    const result = await this.network.connectTarget({
      targetIp: host,
      connectionType: 'ssh',
    });
    const ok = result.success === true;
    this.db.updateWorkspaceNodeStatus(
      nodeId,
      ok ? 'online' : 'offline',
      JSON.stringify({
        ...meta,
        username,
        host,
        error: ok ? '' : String(result.error ?? 'SSH 连接失败'),
      }),
    );
    return this.toNodeView(this.db.getWorkspaceNode(nodeId)!);
  }

  removeNode(workspaceId: string, nodeId: string): { ok: true } {
    const node = this.db.getWorkspaceNode(nodeId);
    if (!node || node.workspaceId !== workspaceId) {
      throw new NotFoundException('主机节点不存在');
    }
    if (node.kind === 'local') {
      throw new BadRequestException('不能删除本机节点');
    }
    this.db.deleteWorkspaceNode(nodeId);
    return { ok: true };
  }

  bindSession(workspaceId: string, sessionId: string, nodeId?: string): { ok: true } {
    if (!this.db.getWorkspace(workspaceId)) {
      throw new NotFoundException(`工作空间不存在: ${workspaceId}`);
    }
    this.db.bindWorkspaceSession(workspaceId, sessionId.trim(), nodeId);
    return { ok: true };
  }

  private requireWorkspace(id: string): WorkspaceView {
    const found = this.list().find((item) => item.id === id);
    if (!found) throw new NotFoundException(`工作空间不存在: ${id}`);
    return found;
  }

  private ensureDefaultWorkspace(): void {
    this.db.upsertWorkspace(DEFAULT_WORKSPACE_ID, '本机');
    this.refreshLocalNode();
  }

  private refreshLocalNode(): void {
    const hostname = os.hostname();
    this.db.upsertWorkspaceNode({
      id: LOCAL_NODE_ID,
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: hostname || 'localhost',
      kind: 'local',
      address: hostname || 'localhost',
      status: 'online',
      meta: JSON.stringify({ hostname }),
    });
  }

  private toNodeView(node: {
    id: string;
    workspaceId: string;
    name: string;
    kind: string;
    address: string;
    status: string;
    createdAt: string;
    meta: string;
  }): WorkspaceNodeView {
    const meta = this.readMeta(node.meta);
    const status = node.status === 'online' || node.status === 'offline' ? node.status : 'unknown';
    return {
      id: node.id,
      workspaceId: node.workspaceId,
      name: node.name,
      kind: (['local', 'secbot', 'ssh'].includes(node.kind)
        ? node.kind
        : 'secbot') as WorkspaceNodeKind,
      address: node.address,
      status,
      createdAt: node.createdAt,
      hostname: typeof meta.hostname === 'string' ? meta.hostname : undefined,
      error: typeof meta.error === 'string' && meta.error ? meta.error : undefined,
    };
  }

  private readMeta(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw || '{}') as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private async probeSecbot(
    origin: string,
  ): Promise<{ ok: boolean; hostname?: string; error?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const health = await fetch(`${origin}/health`, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!health.ok) {
        return { ok: false, error: `健康检查失败（HTTP ${health.status}）` };
      }
      let hostname: string | undefined;
      try {
        const infoRes = await fetch(`${origin}/api/system/info`, {
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
        });
        if (infoRes.ok) {
          const payload = (await infoRes.json()) as {
            data?: { hostname?: string };
            hostname?: string;
          };
          hostname = payload.data?.hostname ?? payload.hostname;
        }
      } catch {
        /* health is enough to mark online */
      }
      return { ok: true, hostname };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message.includes('abort') ? '连接超时' : message };
    } finally {
      clearTimeout(timer);
    }
  }
}
