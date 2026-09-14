export const THEME_STORAGE_KEY = 'secbot-theme'
export const DEFAULT_THEME = 'hacker'
export const THEMES = ['hacker', 'light'] as const

export type ThemeId = (typeof THEMES)[number]

export function normalizeTheme(theme: string | null | undefined): ThemeId {
  return theme === 'light' ? 'light' : 'hacker'
}

export function applyTheme(theme: string) {
  const resolved = normalizeTheme(theme)
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  root.classList.toggle('dark', resolved !== 'light')
}
