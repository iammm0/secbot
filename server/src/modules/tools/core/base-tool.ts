export interface ToolResult {
  success: boolean;
  result: unknown;
  error?: string;
}

export abstract class BaseTool {
  readonly name: string;
  readonly description: string;
  readonly sensitive: boolean;

  constructor(name: string, description: string, sensitive = false) {
    this.name = name;
    this.description = description;
    this.sensitive = sensitive;
  }

  abstract run(params: Record<string, unknown>): Promise<ToolResult>;
}
