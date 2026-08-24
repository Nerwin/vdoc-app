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
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].toLowerCase().includes(needle)) {
      return { line: index + 1, snippet: lines[index].trim().slice(0, 200) }
    }
  }
  return null
}
