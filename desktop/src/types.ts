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
  node_version: string;
}

export interface SessionsResponse {
  sessions: unknown[];
  note?: string;
}

export interface AgentInfo {
  type: string;
  name: string;
  description: string;
}

export interface AgentListResponse {
  agents: AgentInfo[];
}

export interface ToolInfo {
  name: string;
  description: string;
  category?: string;
}

export interface ToolCategory {
  id: string;
  name: string;
  count: number;
  tools: ToolInfo[];
}

export interface ToolsResponse {
  total: number;
  basic_count: number;
  advanced_count: number;
  categories: ToolCategory[];
  tools: ToolInfo[];
}

export interface SystemConfigResponse {
  llm_provider: string;
  ollama_model: string;
  ollama_base_url: string;
  deepseek_model?: string | null;
  deepseek_base_url?: string | null;
  current_provider_model?: string | null;
  current_provider_base_url?: string | null;
}

export type RootAction = "run_once" | "always_allow" | "deny";
