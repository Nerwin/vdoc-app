/** Relative-time formatting shared by the status bar, settings, and dashboard. */

/** Humanised TTL: ≥24h → `6d 2h`, ≥1h → `14h`, else minutes (min 1m). */
export function humanTtl(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours >= 1) return `${hours}h`
  return `${Math.max(1, Math.floor(ms / 60_000))}m`
}

/** Relative past time — `just now`, `5m ago`, `3h ago`, `2d ago`. */
export function timeAgo(at: number | string | Date): string {
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / (24 * 60))}d ago`
}
