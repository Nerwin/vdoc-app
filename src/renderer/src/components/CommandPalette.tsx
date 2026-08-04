import { useEffect, useMemo, useRef, useState } from 'react'

import { displayState, type FileEntry } from '../../../shared/status.ts'
import { fuzzyRank } from '../../../shared/fuzzy.ts'
import { STATE_META } from '../state-meta.ts'

interface Props {
  entries: Map<string, FileEntry>
  onPick(path: string): void
  onClose(): void
}

export function CommandPalette({ entries, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(
    () => fuzzyRank(query, [...entries.keys()], 15),
    [query, entries],
  )

  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex(current => Math.min(current + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex(current => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && results[index]) {
      onPick(results[index])
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="mx-auto mt-24 w-[560px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Go to file…"
          spellCheck={false}
          className="w-full border-b border-line bg-transparent px-4 py-3 font-mono text-[13px] text-ink placeholder-ink-faint outline-none"
        />
        <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-3 text-[12px] text-ink-faint">No matching files</li>}
          {results.map((path, i) => {
            const entry = entries.get(path)
            const meta = STATE_META[entry ? displayState(entry) : 'unchecked']
            const slash = path.lastIndexOf('/')
            return (
              <li key={path}>
                <button
                  onClick={() => onPick(path)}
                  onMouseMove={() => setIndex(i)}
                  className={`flex w-full items-center gap-2 px-4 py-1.5 text-left font-mono text-[12px] ${
                    i === index ? 'bg-raised text-ink' : 'text-ink-dim'
                  }`}
                >
                  <span className={`w-3 text-center ${meta.color}`}>{meta.glyph}</span>
                  <span className="truncate">
                    <span className="text-ink">{path.slice(slash + 1)}</span>
                    <span className="text-ink-faint">  {path.slice(0, slash + 1)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
