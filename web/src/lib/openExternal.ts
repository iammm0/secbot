import { isTauriRuntime } from './petWindow'

/**
 * 用系统默认浏览器打开外部链接。
 * - Tauri 桌面端：shell 插件 open()（需 capabilities 里 shell:allow-open）
 * - 浏览器：window.open 新标签
 * WebView 里 <a target="_blank"> 不会跳转系统浏览器，必须显式拦截。
 */
export function openExternal(url: string): void {
  if (!url) return
  if (isTauriRuntime()) {
    import('@tauri-apps/plugin-shell')
      .then(({ open }) => open(url))
      .catch((err) => console.warn('[secbot] 打开外部链接失败', err))
    return
  }
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (win) win.opener = null
}

/** 给 <a> 用的 onClick：阻止 WebView 默认行为，转系统浏览器打开 */
export function makeExternalOpen(url?: string) {
  return (event: { preventDefault: () => void }) => {
    event.preventDefault()
    openExternal(url ?? '')
  }
}
