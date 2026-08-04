/**
 * Score a query against a path for the command palette. Lower is better,
 * null = no match. Basename substring beats path substring beats subsequence.
 */
export function fuzzyScore(query: string, path: string): number | null {
  const q = query.toLowerCase()
  if (q === '') return 0
  const p = path.toLowerCase()

  const name = p.slice(p.lastIndexOf('/') + 1)
  const inName = name.indexOf(q)
  if (inName >= 0) return inName

  const inPath = p.indexOf(q)
  if (inPath >= 0) return 100 + inPath

  let last = -1
  let spread = 0
  for (const char of q) {
    const index = p.indexOf(char, last + 1)
    if (index < 0) return null
    if (last >= 0) spread += index - last - 1
    last = index
  }
  return 1000 + spread
}

/** Paths ranked best-first for the query, capped at `limit`. */
export function fuzzyRank(query: string, paths: string[], limit: number): string[] {
  return paths
    .map(path => ({ path, score: fuzzyScore(query, path) }))
    .filter((entry): entry is { path: string, score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(entry => entry.path)
}
