const CHANNEL = 'secbot-pet'
const PET_LABEL = 'pet'

export type PetBroadcast =
  | { type: 'activity'; busy: boolean; phase?: string }
  | { type: 'theme' }
  | { type: 'speak'; text: string }

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function broadcastPet(msg: PetBroadcast) {
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage(msg)
    ch.close()
  } catch {
    /* ignore */
  }
}

function petUrl(): string {
  const { protocol, host } = window.location
  // Vite / Nest both serve pet.html at site root
  return `${protocol}//${host}/pet.html`
}

/** Open or focus the always-on-top transparent pet window (desktop only). */
export async function ensurePetWindow(): Promise<boolean> {
  if (!isTauriRuntime()) return false
  try {
    const { WebviewWindow, getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const existing = await WebviewWindow.getByLabel(PET_LABEL)
    if (existing) {
      await existing.show()
      await existing.setAlwaysOnTop(true)
      return true
    }

    // Avoid creating a nested pet from the pet window itself
    const current = getCurrentWebviewWindow()
    if (current.label === PET_LABEL) return true

    const pet = new WebviewWindow(PET_LABEL, {
      url: petUrl(),
      title: 'Secbot Pet',
      width: 140,
      height: 160,
      minWidth: 120,
      minHeight: 140,
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      shadow: false,
      focus: false,
      visible: true,
      x: Math.max(40, window.screen.width - 180),
      y: Math.max(40, window.screen.height - 220),
    })

    await new Promise<void>((resolve, reject) => {
      pet.once('tauri://created', () => resolve())
      pet.once('tauri://error', (event: unknown) => reject(event))
      window.setTimeout(() => resolve(), 1500)
    })
    return true
  } catch (err) {
    console.warn('[secbot-pet] failed to open floating window', err)
    return false
  }
}

export async function closePetWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const existing = await WebviewWindow.getByLabel(PET_LABEL)
    if (existing) await existing.close()
  } catch {
    /* ignore */
  }
}
