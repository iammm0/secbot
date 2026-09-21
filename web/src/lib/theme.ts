export const THEME_STORAGE_KEY = 'secbot-theme'
export const DEFAULT_THEME = 'system'
export const THEMES = ['system', 'hacker', 'light'] as const

export type ThemePreference = (typeof THEMES)[number]
export type ResolvedTheme = 'hacker' | 'light'

/** @deprecated use ThemePreference */
export type ThemeId = ThemePreference

export function normalizeTheme(theme: string | null | undefined): ThemePreference {
  if (theme === 'light' || theme === 'hacker' || theme === 'system') return theme
  return DEFAULT_THEME
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light') return 'light'
  if (preference === 'hacker') return 'hacker'
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'hacker'
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'hacker'
}

export function applyTheme(theme: string) {
  const preference = normalizeTheme(theme)
  const resolved = resolveTheme(preference)
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  root.setAttribute('data-theme-pref', preference)
  root.classList.toggle('dark', resolved !== 'light')
}

export function getStoredTheme(): ThemePreference {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

export function setStoredTheme(theme: ThemePreference) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
  try {
    const ch = new BroadcastChannel('secbot-pet')
    ch.postMessage({ type: 'theme' })
    ch.close()
  } catch {
    /* ignore */
  }
}

/** Keep `system` preference in sync with OS appearance changes. */
export function watchSystemTheme(onChange?: (resolved: ResolvedTheme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const handler = () => {
    const pref = getStoredTheme()
    if (pref !== 'system') return
    applyTheme('system')
    onChange?.(resolveTheme('system'))
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
