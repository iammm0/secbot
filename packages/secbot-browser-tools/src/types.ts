export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface BrowserToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  artifacts?: string[];
  elapsedMs?: number;
}

export interface ToolProvider {
  listTools(): ToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<BrowserToolResult>;
}
