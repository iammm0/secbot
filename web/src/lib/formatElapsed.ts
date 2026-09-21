/** Format milliseconds as compact clock: `12s` · `1:05` · `12:34` · `1:02:03` */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }
  return `${seconds}s`
}
