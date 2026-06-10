export interface ToolResult {
  success: boolean;
  result: unknown;
  error?: string;
}

export interface ToolProgress {
  status: 'running' | 'quiet' | 'possibly_stuck' | 'done' | 'failed' | 'timed_out';
  tool?: string;
  phase?: string;
  progress?: number;
  elapsed_ms?: number;
  last_output_age_ms?: number;
  message?: string;
  hint?: string;
  command?: string;
  raw?: string;
}

export type ToolProgressCallback = (progress: ToolProgress) => void;

export abstract class BaseTool {
  readonly name: string;
  readonly description: string;
  readonly sensitive: boolean;

  constructor(name: string, description: string, sensitive = false) {
    this.name = name;
    this.description = description;
    this.sensitive = sensitive;
  }

  abstract run(
    params: Record<string, unknown>,
    onProgress?: ToolProgressCallback,
  ): Promise<ToolResult>;
}
