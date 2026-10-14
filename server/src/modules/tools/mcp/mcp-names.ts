export const MCP_TOOL_CAP = 24;
export const MCP_DESCRIPTION_MAX = 160;

export function slugMcpPart(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (slug || 'x').slice(0, 40);
}

export function mcpVirtualToolName(server: string, tool: string): string {
  return `mcp__${slugMcpPart(server)}__${slugMcpPart(tool)}`;
}

export function truncateMcpDescription(server: string, description: string): string {
  const text = `[${server}] ${description.trim() || 'MCP tool'}`;
  if (text.length <= MCP_DESCRIPTION_MAX) return text;
  return `${text.slice(0, MCP_DESCRIPTION_MAX - 1)}…`;
}
