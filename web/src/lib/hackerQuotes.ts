/** Original English lines from Paul Graham, Hackers & Painters (O'Reilly, 2004) and companion essays. */
export type HackerQuote = {
  text: string
  source: string
}

export const HACKER_PAINTER_QUOTES: HackerQuote[] = [
  {
    text: 'Hackers and painters have in common that they\'re both makers.',
    source: 'Hackers & Painters',
  },
  {
    text: 'Along with composers, architects, and writers, what hackers and painters are trying to do is make good things.',
    source: 'Hackers & Painters',
  },
  {
    text: 'Hackers need to understand the theory of computation about as much as painters need to understand paint chemistry.',
    source: 'Hackers & Painters',
  },
  {
    text: 'Because painters leave a trail of work behind them, you can watch them learn over time.',
    source: 'Hackers & Painters',
  },
  {
    text: 'Among programmers, "hacker" means a good programmer. But the two meanings are connected.',
    source: 'The Word "Hacker"',
  },
  {
    text: 'To programmers, "hacker" connotes mastery in the most literal sense: someone who can make a computer do what he wants—whether the computer wants to or not.',
    source: 'The Word "Hacker"',
  },
  {
    text: 'Good design is simple.',
    source: 'Taste for Makers',
  },
  {
    text: 'Good design is suggestive.',
    source: 'Taste for Makers',
  },
  {
    text: 'Good design is often strange.',
    source: 'Taste for Makers',
  },
  {
    text: 'Good design is timeless.',
    source: 'Taste for Makers',
  },
]

/** Stable pick for a given key (e.g. session id); random when key is omitted. */
export function pickHackerQuote(seed?: string): HackerQuote {
  const list = HACKER_PAINTER_QUOTES
  if (!seed) {
    return list[Math.floor(Math.random() * list.length)]!
  }
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return list[hash % list.length]!
}
