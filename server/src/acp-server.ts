import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ChatService } from './modules/chat/chat.service';
import { Readable, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';

/**
 * ACP（Agent Client Protocol v1）stdio server：
 * 把 secbot 的 ReAct agent 循环暴露为「外部 agent」，供 Zed / VS Code ACP / JetBrains
 * 等 ACP 客户端 `session/prompt` 驱动。协议方法见 @agentclientprotocol/sdk 的 methods.agent.*。
 *
 * v1 范围：
 * - initialize / session/new / session/prompt / session/cancel / session/close
 * - session/update 通知流：thought→agent_thought_chunk，内容→agent_message_chunk，
 *   action→tool_call/tool_call_update，phase/planning→plan。
 * - HITL 需要人审的操作暂以 agent 消息文本形式透出（不挂起），属已知限制。
 *
 * 注意：本进程 stdout 只能输出 ACP NDJSON，其余日志一律走 stderr。
 */

type AcpSdk = typeof import('@agentclientprotocol/sdk');

interface AcpSession {
  sessionId: string;
  cwd?: string;
  abort: AbortController;
  pendingText: string;
  toolCallId: string | null;
  toolName: string | null;
}

function textOfPrompt(prompt: unknown): string {
  if (!prompt) return '';
  if (typeof prompt === 'string') return prompt;
  if (Array.isArray(prompt)) {
    return prompt
      .map((block) => {
        const item = block as { type?: string; text?: string };
        if (item?.type === 'text') return item.text ?? '';
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

async function bootstrap() {
  // 日志走 stderr，避免污染 ACP 的 stdout 协议流
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const chatService = app.get(ChatService);

  const sdk: AcpSdk = await import('@agentclientprotocol/sdk');
  const { agent, methods, ndJsonStream } = sdk;
  const sessions = new Map<string, AcpSession>();

  const acp = agent({ name: 'secbot-acp' });

  acp.onRequest(methods.agent.initialize, async () => ({
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: false,
      promptCapabilities: { image: false, audio: false, embeddedContext: false },
      mcpCapabilities: { http: false, sse: false },
      sessionCapabilities: {},
      auth: {},
    },
    authMethods: [],
  }));

  acp.onRequest(methods.agent.session.new, async (cx) => {
    const sessionId = randomUUID();
    sessions.set(sessionId, {
      sessionId,
      cwd: typeof cx.params.cwd === 'string' ? cx.params.cwd : undefined,
      abort: new AbortController(),
      pendingText: '',
      toolCallId: null,
      toolName: null,
    });
    return { sessionId };
  });

  acp.onRequest(methods.agent.session.close, async (cx) => {
    sessions.delete(cx.params.sessionId);
    return {};
  });

  acp.onRequest(methods.agent.session.delete, async (cx) => {
    sessions.delete(cx.params.sessionId);
    return {};
  });

  acp.onRequest(methods.agent.session.list, async () => ({
    sessions: [...sessions.values()].map((session) => ({
      sessionId: session.sessionId,
      cwd: session.cwd ?? process.cwd(),
      summary: { title: `secbot ${session.sessionId.slice(0, 8)}` },
    })),
  }));

  acp.onNotification(methods.agent.session.cancel, (cx) => {
    const session = sessions.get(cx.params.sessionId);
    session?.abort.abort();
  });

  acp.onRequest(methods.agent.session.prompt, async (cx) => {
    const session = sessions.get(cx.params.sessionId);
    if (!session) throw new Error(`unknown session ${cx.params.sessionId}`);
    const text = textOfPrompt(cx.params.prompt);
    const message = text ? `${session.pendingText}\n${text}`.trim() : session.pendingText.trim();
    session.pendingText = '';
    if (!message) return { stopReason: 'end_turn' };

    // 新一轮开始时清掉上一轮 tool 状态
    session.toolCallId = null;
    session.toolName = null;
    const turnAbort = new AbortController();
    session.abort = turnAbort;

    const notifyUpdate = (update: Record<string, unknown>) => {
      if (turnAbort.signal.aborted) return;
      void cx.client
        .notify(methods.client.session.update, {
          sessionId: session.sessionId,
          update: update as never,
        })
        .catch(() => undefined);
    };

    try {
      await chatService.handleMessage(
        {
          message,
          session_id: session.sessionId,
          mode: 'agent',
          agent: 'hackbot',
        },
        (eventName, data) => {
          mapSseToAcp(eventName, data, session, notifyUpdate);
        },
        turnAbort.signal,
      );
      return { stopReason: 'end_turn' };
    } catch (error) {
      notifyUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: `[secbot-acp] 执行出错：${String(error)}` },
        messageId: null,
      });
      return { stopReason: 'end_turn' };
    }
  });

  const connection = acp.connect(
    ndJsonStream(Writable.toWeb(process.stdout) as never, Readable.toWeb(process.stdin) as never),
  );
  connection.closed.catch(() => undefined);

  const shutdown = async () => {
    try {
      connection.close();
    } catch {
      /* ignore */
    }
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

/** 把 secbot 的 SSE 事件流映射为 ACP 的 session/update 通知 */
function mapSseToAcp(
  eventName: string,
  data: Record<string, unknown>,
  session: AcpSession,
  notifyUpdate: (update: Record<string, unknown>) => void,
): void {
  const asString = (value: unknown, fallback = ''): string => {
    if (value == null) return fallback;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  };

  switch (eventName) {
    case 'thought':
    case 'thought_start':
      notifyUpdate({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: asString(data.content ?? data.thought ?? '') },
        messageId: null,
      });
      break;
    case 'content':
    case 'response':
    case 'response_chunk':
    case 'report':
      notifyUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: asString(data.content ?? data.chunk ?? data.response ?? ''),
        },
        messageId: null,
      });
      break;
    case 'action_start': {
      session.toolCallId = randomUUID();
      const rawTool = data.tool ?? data.tool_name ?? '';
      session.toolName = typeof rawTool === 'string' && rawTool ? rawTool.slice(0, 120) : null;
      notifyUpdate({
        sessionUpdate: 'tool_call',
        toolCallId: session.toolCallId,
        title: `执行工具：${session.toolName ?? 'secbot'}`,
        name: session.toolName,
        kind: 'execute',
      });
      break;
    }
    case 'action_progress':
      if (session.toolCallId) {
        notifyUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: session.toolCallId,
          status: 'in_progress',
          title: `执行中：${asString(data.detail ?? '')}`.slice(0, 200),
        });
      }
      break;
    case 'action_result':
      if (session.toolCallId) {
        notifyUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId: session.toolCallId,
          status: data.error ? 'failed' : 'completed',
        });
        session.toolCallId = null;
        session.toolName = null;
      }
      break;
    case 'phase':
    case 'planning':
    case 'plan_progress':
    case 'plan_complete':
      notifyUpdate({
        sessionUpdate: 'plan',
        entries: [
          {
            content: asString(data.detail ?? data.content ?? eventName, ''),
            priority: 'high',
            status: 'in_progress',
          },
        ],
      });
      break;
    case 'error':
      notifyUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: `[secbot] ${asString(data.message ?? data.content ?? '执行出错')}`,
        },
        messageId: null,
      });
      break;
    default:
      break;
  }
}

bootstrap().catch((error) => {
  console.error('[secbot-acp] failed to bootstrap', error);
  process.exit(1);
});
