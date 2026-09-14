export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd?: string;
}
