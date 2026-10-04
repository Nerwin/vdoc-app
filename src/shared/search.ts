/** One full-text hit: the first matching line of a file. */
export interface SearchHit {
  path: string
  /** 1-based line number of the first match. */
  line: number
  /** The matching line, trimmed and clipped. */
  snippet: string
}

/** First line containing `query`, case-insensitive - null when absent or the query is blank. */
export function firstMatch(text: string, query: string): { line: number, snippet: string } | null {
  const needle = query.toLowerCase()
  if (needle === '') return null
  // One pass over the whole file - most files miss, and only a hit pays for splitting lines.
  const lower = text.toLowerCase()
  const at = lower.indexOf(needle)
  if (at === -1) return null
  const line = lower.slice(0, at).split('\n').length
  return { line, snippet: (text.split('\n')[line - 1] ?? '').trim().slice(0, 200) }
}
