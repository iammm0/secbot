// Plugin stub - minimal implementation for code study

import type { OpencodeClient } from "@opencode-ai/sdk"

export interface PluginInput {
  client: OpencodeClient
  project: string
  worktree: string
  directory: string
  serverUrl: string
  $: any
}

export interface AuthOuathResult {
  provider: string
  token: string
}

export interface Hooks {
  name: string
  auth?: {
    provider: string
    method: any
  }
  provider?: any
  onStart?: () => void
  onMessage?: (message: any) => void
}

export type Plugin = (input: PluginInput) => Promise<Hooks>

export interface ToolContext {
  sessionId: string
  project: string
  worktree: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  handler: (context: ToolContext, params: any) => Promise<any>
}
