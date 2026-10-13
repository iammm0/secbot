export interface ChatQuote {
  language?: string
  code: string
  kind?: 'code' | 'message'
  label?: string
}

type QuoteHandler = (quote: ChatQuote) => void

let handler: QuoteHandler | null = null

export function registerChatQuote(next: QuoteHandler | null) {
  handler = next
}

export function addToChat(quote: ChatQuote) {
  const code = quote.code.replace(/\n$/, '').trim()
  if (!code) return
  handler?.({ ...quote, code })
}
