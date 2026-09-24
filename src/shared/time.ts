/** Relative-time formatting shared by the status bar, settings, and dashboard. */

/** Humanised TTL: ≥24h → `6d 2h`, ≥1h → `14h`, else minutes (min 1m). */
export function humanTtl(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours >= 1) return `${hours}h`
  return `${Math.max(1, Math.floor(ms / 60_000))}m`
}

const UNITS = { short: ['min', 'h', 'd'], long: ['minute', 'hour', 'day'] } as const

/** Relative past time - `just now`, `5 min ago`, `3 h ago`, `2 d ago`; `long` spells the unit out for prose. */
export function timeAgo(at: number | string | Date, style: keyof typeof UNITS = 'short'): string {
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  const [value, unit] = minutes < 60 ? [minutes, 0] : minutes < 24 * 60 ? [Math.floor(minutes / 60), 1] : [Math.floor(minutes / (24 * 60)), 2]
  const word = UNITS[style][unit]
  return style === 'long' ? `${value} ${word}${value === 1 ? '' : 's'} ago` : `${value} ${word} ago`
}
