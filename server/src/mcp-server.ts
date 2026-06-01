import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppModule } from './app.module';
import { ToolsService } from './modules/tools/tools.service';

const toolInputSchema = {
  params: z.any().optional(),
};

type RegisterToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: typeof toolInputSchema;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
};

type RegisterToolResult = {
  content: Array<{
    type: 'text';
    text: string;
  }>;
};

type RegisterTool = (
  name: string,
  config: RegisterToolConfig,
  callback: (args: { params?: unknown }) => Promise<RegisterToolResult>,
) => unknown;

function normalizeParams(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const toolsService = app.get(ToolsService);
  const allowSensitive = ['1', 'true', 'yes'].includes(
    (process.env.SECBOT_MCP_ALLOW_SENSITIVE ?? '').trim().toLowerCase(),
  );

  const server = new McpServer({
    name: 'secbot-mcp',
    version: '1.0.0',
  });
  const registerTool = (server.registerTool as unknown as RegisterTool).bind(server);

  for (const tool of toolsService.getAllTools()) {
    if (tool.sensitive && !allowSensitive) {
      continue;
    }

    registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: toolInputSchema,
        annotations: {
          readOnlyHint: !tool.sensitive,
          destructiveHint: tool.sensitive,
          openWorldHint: true,
        },
      },
      async ({ params }: { params?: unknown }) => {
        const result = await tool.run(normalizeParams(params));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await app.close().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap MCP server', error);
  process.exit(1);
});
