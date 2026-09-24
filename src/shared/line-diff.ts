/** Line diff (Myers) grouped into hunks, plus the merge that applies per-hunk decisions. */

export type Segment =
  | { kind: 'equal', lines: string[] }
  | { kind: 'change', local: string[], remote: string[] }

export type HunkChoice = 'mine' | 'theirs' | 'both'

export interface Hunk {
  /** Zero-based position among the change segments. */
  index: number
  local: string[]
  remote: string[]
  /** 1-based line range in the local file (end < start for a pure insertion). */
  localStart: number
  localEnd: number
  before: string[]
  after: string[]
}

const splitLines = (text: string): string[] => (text === '' ? [] : text.split('\n'))

type Op = 'eq' | 'del' | 'ins'

function myers(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  const max = n + m
  const offset = max
  let v = new Int32Array(2 * max + 2)
  const trace: Int32Array[] = []
  let done = false
  for (let d = 0; d <= max && !done; d++) {
    trace.push(v)
    v = v.slice()
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        done = true
        break
      }
    }
  }

  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]) ? k + 1 : k - 1
    const prevX = prev[offset + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push('eq')
      x--
      y--
    }
    if (x === prevX) {
      ops.push('ins')
      y--
    } else {
      ops.push('del')
      x--
    }
  }
  while (x > 0 && y > 0) {
    ops.push('eq')
    x--
    y--
  }
  return ops.reverse()
}

export function diffLines(local: string, remote: string): Segment[] {
  const a = splitLines(local)
  const b = splitLines(remote)
  const segments: Segment[] = []
  let ai = 0
  let bi = 0
  for (const op of myers(a, b)) {
    const last = segments.at(-1)
    if (op === 'eq') {
      if (last?.kind === 'equal') last.lines.push(a[ai])
      else segments.push({ kind: 'equal', lines: [a[ai]] })
      ai++
      bi++
      continue
    }
    const change = last?.kind === 'change' ? last : { kind: 'change' as const, local: [], remote: [] }
    if (change !== last) segments.push(change)
    if (op === 'del') change.local.push(a[ai++])
    else change.remote.push(b[bi++])
  }
  return segments
}

const CONTEXT = 2

export function hunksOf(segments: Segment[]): Hunk[] {
  const hunks: Hunk[] = []
  let line = 1
  segments.forEach((segment, position) => {
    if (segment.kind === 'equal') {
      line += segment.lines.length
      return
    }
    const previous = segments[position - 1]
    const next = segments[position + 1]
    hunks.push({
      index: hunks.length,
      local: segment.local,
      remote: segment.remote,
      localStart: line,
      localEnd: line + segment.local.length - 1,
      before: previous?.kind === 'equal' ? previous.lines.slice(-CONTEXT) : [],
      after: next?.kind === 'equal' ? next.lines.slice(0, CONTEXT) : [],
    })
    line += segment.local.length
  })
  return hunks
}

/** Rebuild the file from the segments with one decision per change; throws when a hunk is undecided. */
export function mergeSegments(segments: Segment[], choices: ReadonlyMap<number, HunkChoice>): string {
  const lines: string[] = []
  let index = 0
  for (const segment of segments) {
    if (segment.kind === 'equal') {
      lines.push(...segment.lines)
      continue
    }
    const choice = choices.get(index)
    if (!choice) throw new Error(`Hunk ${index + 1} is unresolved`)
    if (choice !== 'theirs') lines.push(...segment.local)
    if (choice !== 'mine') lines.push(...segment.remote)
    index++
  }
  return lines.join('\n')
}
