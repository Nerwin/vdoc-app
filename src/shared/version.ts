/** True when `latest` is a strictly newer x.y.z version than `current` (leading v ignored). */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (version: string): number[] =>
    version.trim().replace(/^v/i, '').split('.').map(part => parseInt(part, 10) || 0)
  const a = parse(latest)
  const b = parse(current)
  for (let index = 0; index < 3; index++) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0)
  }
  return false
}
