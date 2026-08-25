interface Semver {
  major: number
  minor: number
  patch: number
  prerelease: string[]
  normalized: string
}

/** Finds a semantic version in either a plain tag or Oclif's `package/x.y.z platform` output. */
function parseVersion(value: string): Semver | null {
  const match = /(?:^|[^0-9A-Za-z])v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?=$|[^0-9A-Za-z.-])/.exec(value.trim())
  if (!match) return null
  const prerelease = match[4]?.split('.') ?? []
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
    normalized: `${match[1]}.${match[2]}.${match[3]}${prerelease.length > 0 ? `-${prerelease.join('.')}` : ''}`,
  }
}

/** Normalized semantic version found in a tag or CLI version line. */
export function extractVersion(value: string): string | null {
  return parseVersion(value)?.normalized ?? null
}

/** Semver comparison; null means at least one input contained no valid x.y.z version. */
export function compareVersions(left: string, right: string): number | null {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return null

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1
  }

  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0
    return a.prerelease.length === 0 ? 1 : -1
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index++) {
    const leftPart = a.prerelease[index]
    const rightPart = b.prerelease[index]
    if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1
    if (leftPart === rightPart) continue
    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric) return Number(leftPart) > Number(rightPart) ? 1 : -1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
}

/** True when `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) === 1
}

/** True only when both values parse and the installed version is below the requirement. */
export function isVersionBelowMinimum(current: string, minimum: string): boolean {
  return compareVersions(current, minimum) === -1
}
