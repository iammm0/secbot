export interface ChatQuote {
  language?: string
  code: string
}

type QuoteHandler = (quote: ChatQuote) => void

let handler: QuoteHandler | null = null

export function registerChatQuote(next: QuoteHandler | null) {
  handler = next
}

export function addToChat(quote: ChatQuote) {
  const code = quote.code.replace(/\n$/, '').trim()
  if (!code) return
  handler?.({ language: quote.language, code })
}
