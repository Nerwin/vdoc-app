import { useMemo, useRef, useState } from 'react'

import type { DisplayState } from '../../../shared/types.ts'
import { displayState, needsAttention, type FileEntry } from '../../../shared/status.ts'
import { buildTree, filesUnder, flattenVisible, type TreeNode } from '../../../shared/tree.ts'
import { STATE_META } from '../state-meta.ts'

interface Props {
  entries: Map<string, FileEntry>
  selection: string | null
  filterText: string
  stateFilter: DisplayState | 'attention' | null
  onSelect(path: string): void
  onOpenDiff(path: string): void
}

export function FileTree({ entries, selection, filterText, stateFilter, onSelect, onOpenDiff }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const filtering = filterText !== '' || stateFilter !== null

  const rows = useMemo(() => {
    const query = filterText.toLowerCase()
    const paths = [...entries.values()]
      .filter(entry => {
        if (query && !entry.path.toLowerCase().includes(query)) return false
        if (!stateFilter) return true
        const state = displayState(entry)
        return stateFilter === 'attention' ? needsAttention(state) : state === stateFilter
      })
      .map(entry => entry.path)
    // A filter shows every match expanded; the collapse set only applies when browsing.
    return flattenVisible(buildTree(paths), filtering ? new Set() : collapsed)
  }, [entries, filterText, stateFilter, filtering, collapsed])

  const fileRows = useMemo(() => rows.filter(row => row.kind === 'file'), [rows])

  const toggleDir = (path: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && selection) {
      event.preventDefault()
      onOpenDiff(selection)
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    if (fileRows.length === 0) return
    const index = fileRows.findIndex(row => row.path === selection)
    const nextIndex = event.key === 'ArrowDown'
      ? Math.min(index + 1, fileRows.length - 1)
      : Math.max(index <= 0 ? 0 : index - 1, 0)
    const next = fileRows[nextIndex]
    onSelect(next.path)
    containerRef.current?.querySelector(`[data-path="${CSS.escape(next.path)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="h-full overflow-y-auto py-2 font-mono text-[12px] outline-none"
    >
      {rows.length === 0 && (
        <p className="px-4 py-8 text-center text-ink-faint">
          {entries.size === 0 ? 'Scanning…' : 'No files match this filter'}
        </p>
      )}
      {rows.map(row => (
        <Row
          key={row.path}
          node={row}
          entries={entries}
          selected={row.path === selection}
          collapsed={!filtering && collapsed.has(row.path)}
          onClick={() => (row.kind === 'dir' ? toggleDir(row.path) : onSelect(row.path))}
        />
      ))}
    </div>
  )
}

interface RowProps {
  node: TreeNode
  entries: Map<string, FileEntry>
  selected: boolean
  collapsed: boolean
  onClick(): void
}

function Row({ node, entries, selected, collapsed, onClick }: RowProps) {
  const indent = { paddingLeft: `${12 + node.depth * 14}px` }

  if (node.kind === 'dir') {
    const attention = filesUnder(node).reduce((sum, path) => {
      const entry = entries.get(path)
      return sum + (entry && needsAttention(displayState(entry)) ? 1 : 0)
    }, 0)
    return (
      <button
        onClick={onClick}
        style={indent}
        className="flex w-full items-center gap-1.5 py-[3px] pr-3 text-left text-ink-dim hover:bg-panel"
      >
        <span className="w-3 text-center text-[9px] text-ink-faint">{collapsed ? '▸' : '▾'}</span>
        <span className="truncate">{node.name}</span>
        {attention > 0 && (
          <span className="ml-auto rounded-full bg-raised px-1.5 text-[10px] text-ahead">{attention}</span>
        )}
      </button>
    )
  }

  const entry = entries.get(node.path)
  const state = entry ? displayState(entry) : 'unchecked'
  const meta = STATE_META[state]
  const quiet = state === 'in-sync' || state === 'untracked' || state === 'unchecked'

  return (
    <button
      data-path={node.path}
      onClick={onClick}
      title={meta.hint}
      style={indent}
      className={`flex w-full items-center gap-1.5 py-[3px] pr-3 text-left hover:bg-panel ${
        selected ? 'bg-raised text-ink shadow-[inset_2px_0_0_var(--color-accent)]' : quiet ? 'text-ink-dim' : 'text-ink'
      }`}
    >
      <span className={`w-3 text-center ${quiet && state !== 'in-sync' ? 'text-ink-faint' : meta.color} ${state === 'in-sync' ? 'opacity-40' : ''}`}>
        {meta.glyph}
      </span>
      <span className="truncate">{node.name}</span>
      {entry?.check?.titleMismatch && <span className="text-[10px] text-ahead" title="Frontmatter title differs from the body H1">T</span>}
    </button>
  )
}
