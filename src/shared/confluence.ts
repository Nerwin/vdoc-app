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

/** Raw Atlassian account ids (not mapped in the metadata file) are noise - soften them. */
export const displayAuthor = (author: string): string => (/^\w+:[\w-]{20,}$/.test(author) ? 'unmapped user' : author)
