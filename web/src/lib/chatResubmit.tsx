import { createContext, useContext, type ReactNode } from 'react'

export interface MessageEditTarget {
  turnKey: string
  role: 'user' | 'assistant'
  blockId?: string
  conversationId?: number
}

type EditMessage = (target: MessageEditTarget, next: string, previous: string) => void

const ChatEditContext = createContext<EditMessage | null>(null)
const MessageEditScopeContext = createContext<{ turnKey: string; conversationId?: number } | null>(null)

export function ChatEditProvider({
  onEdit,
  children,
}: {
  onEdit: EditMessage
  children: ReactNode
}) {
  return <ChatEditContext.Provider value={onEdit}>{children}</ChatEditContext.Provider>
}

export function MessageEditScope({
  turnKey,
  conversationId,
  children,
}: {
  turnKey: string
  conversationId?: number
  children: ReactNode
}) {
  return (
    <MessageEditScopeContext.Provider value={{ turnKey, conversationId }}>
      {children}
    </MessageEditScopeContext.Provider>
  )
}

export function useChatEdit(): EditMessage | null {
  return useContext(ChatEditContext)
}

export function useMessageEditScope(): { turnKey: string; conversationId?: number } | null {
  return useContext(MessageEditScopeContext)
}
