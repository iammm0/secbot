export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export type BlockType =
  | "user"
  | "planning"
  | "task_phase"
  | "thinking"
  | "execution"
  | "exec_result"
  | "observation"
  | "report"
  | "response"
  | "error";

export interface RenderBlock {
  id: string;
  type: BlockType;
  timestamp: Date;
  content?: string;
  agent?: string;
  iteration?: number;
  streaming?: boolean;
  tool?: string;
  params?: Record<string, unknown>;
  success?: boolean;
  result?: unknown;
  error?: string;
  phase?: "planning" | "thinking" | "exec" | "report" | "done";
  detail?: string;
}

export interface SystemInfoResponse {
  os_type: string;
  hostname: string;
  username: string;
  python_version: string;
}

export interface SessionsResponse {
  sessions: unknown[];
  note?: string;
}
