import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NetworkService } from '../network/network.service';
import { DEFAULT_WORKSPACE_ID, LOCAL_NODE_ID } from './workspaces.service';
import { parseSecbotOrigin, parseSshHost } from './secbot-origin';
import { type ExecutionTarget, setSshCommandRunner } from './execution-context';
import { ChatRequestDto } from '../chat/dto/chat.dto';

const PROXY_TIMEOUT_MS = 15 * 60 * 1000;

export interface ResolveExecutionArgs {
  sessionId: string;
  workspaceId?: string;
  nodeId?: string;
}

@Injectable()
export class ExecutionRouter implements OnModuleInit {
  private readonly logger = new Logger(ExecutionRouter.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly network: NetworkService,
  ) {}

  onModuleInit() {
    setSshCommandRunner(async (host, command, _timeoutSec) => {
      const result = await this.network.executeOnTarget({
        targetIp: host,
        command,
        connectionType: 'ssh',
      });
      const success = result.success === true;
      const output = String(result.output ?? '');
      const error = String(result.error ?? '');
      const exitCode =
        typeof result.exit_code === 'number'
          ? result.exit_code
          : typeof result.returncode === 'number'
            ? result.returncode
            : undefined;
      return { success, output, error, exitCode };
    });
  }

  resolve(args: ResolveExecutionArgs): ExecutionTarget {
    const requested = (args.nodeId ?? '').trim();
    const binding = this.db.getWorkspaceSession(args.sessionId);
    const workspaceId =
      (args.workspaceId ?? '').trim() || binding?.workspaceId || DEFAULT_WORKSPACE_ID;
    const boundNodeId = (binding?.nodeId ?? '').trim();
    const fallback = this.defaultNodeId(workspaceId);
    const nodeId = requested || boundNodeId || fallback;
    return this.targetFromNode(nodeId);
  }

  async proxyChat(
    target: Extract<ExecutionTarget, { kind: 'secbot' }>,
    body: ChatRequestDto,
    emit: (event: string, data: Record<string, unknown>) => void,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    abortSignal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ac.abort(), PROXY_TIMEOUT_MS);
    let lastResponse = '';
    try {
      const res = await fetch(`${target.origin}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: body.message,
          session_id: body.session_id,
          mode: body.mode,
          agent: body.agent,
          model: body.model,
          client_shell: body.client_shell,
          resume: body.resume,
          resume_from: body.resume_from,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        emit('error', {
          error: `对端 Secbot 离线或拒绝请求（HTTP ${res.status || 0}）`,
        });
        emit('done', {});
        return '';
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const block of chunks) {
          const parsed = parseSseBlock(block);
          if (!parsed) continue;
          if (parsed.event === 'response') {
            lastResponse = String(parsed.data.content ?? lastResponse);
          }
          emit(parsed.event, parsed.data);
        }
      }
      return lastResponse;
    } catch (error) {
      const aborted = ac.signal.aborted;
      const message = error instanceof Error ? error.message : String(error);
      emit('error', {
        error: aborted
          ? abortSignal?.aborted
            ? '已中止'
            : '连接对端 Secbot 超时'
          : `对端 Secbot 离线：${message}`,
      });
      emit('done', {});
      return '';
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
    }
  }

  private defaultNodeId(workspaceId: string): string {
    if (workspaceId === DEFAULT_WORKSPACE_ID) return LOCAL_NODE_ID;
    const nodes = this.db.listWorkspaceNodes(workspaceId);
    const local = nodes.find((n) => n.kind === 'local');
    return local?.id || nodes[0]?.id || LOCAL_NODE_ID;
  }

  private targetFromNode(nodeId: string): ExecutionTarget {
    const node = this.db.getWorkspaceNode(nodeId);
    if (!node) return { kind: 'local', nodeId: LOCAL_NODE_ID };
    if (node.kind === 'ssh') {
      const meta = readJson(node.meta);
      const parsed = parseSshHost(node.address);
      const host = String(meta.host ?? parsed.host);
      const port =
        typeof meta.port === 'number' && Number.isFinite(meta.port) ? meta.port : parsed.port;
      return { kind: 'ssh', nodeId: node.id, host, port };
    }
    if (node.kind === 'secbot') {
      try {
        return {
          kind: 'secbot',
          nodeId: node.id,
          origin: parseSecbotOrigin(node.address),
        };
      } catch (error) {
        this.logger.warn(`invalid secbot origin for ${node.id}: ${(error as Error).message}`);
        return { kind: 'local', nodeId: LOCAL_NODE_ID };
      }
    }
    return { kind: 'local', nodeId: node.id };
  }
}

function readJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseSseBlock(block: string): { event: string; data: Record<string, unknown> } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim() || event;
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    return { event, data };
  } catch {
    return { event, data: { content: dataLines.join('\n') } };
  }
}
