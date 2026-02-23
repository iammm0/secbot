// SDK stub - minimal implementation for code study

export interface Message {
  role: "user" | "assistant" | "system"
  content: string
}

export interface ToolPart {
  type: "tool"
  tool: string
  input: Record<string, unknown>
}

export interface OpencodeClient {
  sendMessage: (message: Message) => Promise<void>
  onEvent: (handler: (event: Event) => void) => void
}

export interface Event {
  type: string
  data: unknown
}

export interface AssistantMessage {
  role: "assistant"
  content: string | Part[]
}

export interface UserMessage {
  role: "user"
  content: string | Part[]
}

export interface Part {
  type: "text" | "tool" | "image"
  text?: string
  tool?: string
  input?: Record<string, unknown>
}

export interface SessionMessageResponse {
  message: AssistantMessage
}

export function createOpencodeClient(): OpencodeClient {
  return {
    sendMessage: async () => {},
    onEvent: () => {},
  }
}
