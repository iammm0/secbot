export { McpCallTool } from './mcp-call.tool';

import { BaseTool } from '../core/base-tool';
import { McpCallTool } from './mcp-call.tool';

export const MCP_TOOLS: BaseTool[] = [new McpCallTool()];
