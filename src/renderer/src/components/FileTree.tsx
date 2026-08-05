import { useEffect, useMemo, useRef, useState } from 'react'

import type { DisplayState } from '../../../shared/types.ts'
import { displayState, needsAttention, type FileEntry } from '../../../shared/status.ts'
import { buildTree, filesUnder, flattenVisible, orderPinnedFirst, type TreeNode } from '../../../shared/tree.ts'
import { STATE_META } from '../state-meta.ts'

interface Props {
  entries: Map<string, FileEntry>
  selection: string | null
  filterText: string
  stateFilter: DisplayState | 'attention' | null
  /** Configured root folders — the only ones removable from the tree. */
  rootDirs: string[]
  pinnedDirs: string[]
  onSelect(path: string): void
  onOpenDiff(path: string): void
  onCheckFolder(path: string): void
  onTogglePin(path: string): void
  onOpenFolder(path: string): void
  onRemoveFolder(path: string): void
}

interface FolderMenu {
  x: number
  y: number
  path: string
}

export function FileTree({ entries, selection, filterText, stateFilter, rootDirs, pinnedDirs, onSelect, onOpenDiff, onCheckFolder, onTogglePin, onOpenFolder, onRemoveFolder }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<FolderMenu | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const filtering = filterText !== '' || stateFilter !== null

  // While the context menu is open, Escape closes it (and nothing else).
  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setMenu(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menu])

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
    const tree = orderPinnedFirst(buildTree(paths), new Set(pinnedDirs))
    return flattenVisible(tree, filtering ? new Set() : collapsed)
  }, [entries, filterText, stateFilter, filtering, collapsed, pinnedDirs])

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
          pinned={pinnedDirs.includes(row.path)}
          collapsed={!filtering && collapsed.has(row.path)}
          onClick={() => (row.kind === 'dir' ? toggleDir(row.path) : onSelect(row.path))}
          onContextMenu={row.kind === 'dir'
            ? event => {
                event.preventDefault()
                setMenu({ x: event.clientX, y: event.clientY, path: row.path })
              }
            : undefined}
        />
      ))}

      {menu && (
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null) }}>
          <div
            className="absolute w-52 overflow-hidden rounded-lg border border-line bg-raised py-1 shadow-2xl"
            style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 160) }}
            onClick={event => event.stopPropagation()}
          >
            <MenuItem
              label={pinnedDirs.includes(menu.path) ? 'Unpin' : 'Pin on top'}
              onClick={() => { onTogglePin(menu.path); setMenu(null) }}
            />
            <MenuItem
              label="Check this folder"
              onClick={() => { onCheckFolder(menu.path); setMenu(null) }}
            />
            <MenuItem
              label="Open in Finder"
              onClick={() => { onOpenFolder(menu.path); setMenu(null) }}
            />
            {rootDirs.includes(menu.path) && (
              <>
                <div className="mx-2 my-1 h-px bg-line" />
                <MenuItem
                  label="Remove from tree"
                  danger
                  onClick={() => { onRemoveFolder(menu.path); setMenu(null) }}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, onClick, danger }: { label: string, onClick(): void, danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-panel ${danger ? 'text-conflict' : 'text-ink'}`}
    >
      {label}
    </button>
  )
}

interface RowProps {
  node: TreeNode
  entries: Map<string, FileEntry>
  selected: boolean
  pinned: boolean
  collapsed: boolean
  onClick(): void
  onContextMenu?(event: React.MouseEvent): void
}

function Row({ node, entries, selected, pinned, collapsed, onClick, onContextMenu }: RowProps) {
  const indent = { paddingLeft: `${12 + node.depth * 14}px` }

  if (node.kind === 'dir') {
    const attention = filesUnder(node).reduce((sum, path) => {
      const entry = entries.get(path)
      return sum + (entry && needsAttention(displayState(entry)) ? 1 : 0)
    }, 0)
    return (
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={indent}
        className="flex w-full items-center gap-1.5 py-[3px] pr-3 text-left text-ink-dim hover:bg-panel"
      >
        <span className="w-3 text-center text-[9px] text-ink-faint">{collapsed ? '▸' : '▾'}</span>
        <span className="truncate">{node.name}</span>
        {pinned && <span className="text-[9px] text-accent" title="Pinned on top">✦</span>}
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
      {entry?.gitDirty && <span className="ml-auto pl-1 text-[10px] text-ink-faint" title="Uncommitted git changes">±</span>}
    </button>
  )
}
