/**
 * Fuzzy matching for the command palette. Lower score is better, null = no
 * match. Basename substring beats full-text substring beats subsequence.
 */
export interface FuzzyMatch {
  score: number
  /** Matched character positions in the text, for highlighting. */
  indices: number[]
}

const range = (start: number, length: number): number[] => Array.from({ length }, (_, i) => start + i)

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase()
  if (q === '') return { score: 0, indices: [] }
  const t = text.toLowerCase()

  const nameStart = t.lastIndexOf('/') + 1
  const inName = t.slice(nameStart).indexOf(q)
  if (inName >= 0) return { score: inName, indices: range(nameStart + inName, q.length) }

  const inText = t.indexOf(q)
  if (inText >= 0) return { score: 100 + inText, indices: range(inText, q.length) }

  const indices: number[] = []
  let spread = 0
  for (const char of q) {
    const index = t.indexOf(char, (indices.at(-1) ?? -1) + 1)
    if (index < 0) return null
    if (indices.length > 0) spread += index - indices.at(-1)! - 1
    indices.push(index)
  }
  return { score: 1000 + spread, indices }
}

/** Paths ranked best-first for the query, capped at `limit`. */
export function fuzzyRank(query: string, paths: string[], limit: number): string[] {
  return paths
    .map(path => ({ path, match: fuzzyMatch(query, path) }))
    .filter((entry): entry is { path: string, match: FuzzyMatch } => entry.match !== null)
    .sort((a, b) => a.match.score - b.match.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(entry => entry.path)
}
