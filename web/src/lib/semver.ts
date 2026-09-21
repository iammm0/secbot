export type SemVerParts = {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export function parseSemVer(input: string): SemVerParts | null {
  const raw = input.trim().replace(/^v/, '')
  const m = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
  }
}

/** Compare a vs b: -1 if a<b, 0 if equal, 1 if a>b (semver-ish, prerelease < release). */
export function compareSemVer(a: string, b: string): number {
  const pa = parseSemVer(a)
  const pb = parseSemVer(b)
  if (!pa || !pb) return a.localeCompare(b)
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1
  const aPre = pa.prerelease
  const bPre = pb.prerelease
  if (aPre.length === 0 && bPre.length === 0) return 0
  if (aPre.length === 0) return 1
  if (bPre.length === 0) return -1
  const n = Math.max(aPre.length, bPre.length)
  for (let i = 0; i < n; i += 1) {
    const x = aPre[i]
    const y = bPre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x) ? Number(x) : NaN
    const yn = /^\d+$/.test(y) ? Number(y) : NaN
    if (!Number.isNaN(xn) && !Number.isNaN(yn)) {
      if (xn !== yn) return xn < yn ? -1 : 1
    } else {
      const c = x.localeCompare(y)
      if (c !== 0) return c < 0 ? -1 : 1
    }
  }
  return 0
}

export function versionFromDesktopTag(tag: string, prefix: string): string | null {
  if (!tag.startsWith(prefix)) return null
  return tag.slice(prefix.length)
}
