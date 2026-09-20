import { useMemo } from 'react'
import { pickHackerQuote } from '@/lib/hackerQuotes'

interface Props {
  /** Stable seed so a session keeps the same quote while empty. */
  seed?: string
  className?: string
}

export function InitQuote({ seed, className = '' }: Props) {
  const quote = useMemo(() => pickHackerQuote(seed), [seed])

  return (
    <figure className={`mx-auto max-w-xl px-2 text-center ${className}`}>
      <blockquote className="font-mono text-sm leading-relaxed text-text-dim md:text-[15px]">
        <span className="text-primary/70">“</span>
        {quote.text}
        <span className="text-primary/70">”</span>
      </blockquote>
      <figcaption className="mt-3 font-mono text-[10px] tracking-wide text-text-dim/70">
        — Paul Graham
        <span className="mx-1.5 text-border">·</span>
        {quote.source}
      </figcaption>
    </figure>
  )
}
