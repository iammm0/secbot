/** Left sidebar can ask the right rail to open the add-host dialog. */
let openAddHost: (() => void) | null = null

export function registerAddHostOpener(opener: (() => void) | null) {
  openAddHost = opener
}

export function requestAddHost() {
  openAddHost?.()
}
