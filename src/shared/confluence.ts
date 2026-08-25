import type { ConfluenceSpace } from './types.ts'

/** Keep only the accessible-space fields used by the app. */
export function parseConfluenceSpaces(value: unknown): ConfluenceSpace[] {
  if (!Array.isArray(value)) return []

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const { id, key, name } = item as Record<string, unknown>
    return typeof id === 'string' && typeof key === 'string' && typeof name === 'string'
      ? [{ id, key, name }]
      : []
  })
}
