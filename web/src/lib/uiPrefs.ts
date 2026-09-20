export const PET_STORAGE_KEY = 'secbot-show-pet'
export const PREFS_EVENT = 'secbot-prefs'

function emitPrefs() {
  window.dispatchEvent(new Event(PREFS_EVENT))
}

export function getShowPet(): boolean {
  const raw = localStorage.getItem(PET_STORAGE_KEY)
  // unset → default show floating pet
  if (raw === null) return true
  return raw === '1'
}

export function setShowPet(show: boolean) {
  localStorage.setItem(PET_STORAGE_KEY, show ? '1' : '0')
  emitPrefs()
}
