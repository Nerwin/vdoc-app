import { useEffect, useMemo, useRef, useState } from 'react'

import type { DisplayState, TriageFilter } from '../../../shared/types.ts'
import { ATTENTION_STATES, displayState, needsAttention, type FileEntry } from '../../../shared/status.ts'
import { buildTree, filesUnder, flattenVisible, orderPinnedFirst, type TreeNode } from '../../../shared/tree.ts'
import { STATE_META } from '../state-meta.ts'
import { StateDot } from './StateDot.tsx'

interface Props {
  entries: Map<string, FileEntry>
  /** Repo-wide file/tracked counts - computed once in App. */
  totals: { files: number, tracked: number }
  selection: string | null
  filterText: string
  stateFilter: TriageFilter
  counts: { attention: number, behind: number, unverified: number, dirty: number }
  /** Configured root folders - the only ones removable from the tree. */
  rootDirs: string[]
  pinnedDirs: string[]
  onSelect(path: string): void
  onFilterState(filter: TriageFilter): void
  onOpenDiff(path: string): void
  onCheckFolder(path: string): void
  onTogglePin(path: string): void
  onOpenFolder(path: string): void
  onRemoveFolder(path: string): void
  onSetIgnore(path: string, ignored: boolean): void
  onCopyPageId(pageId: string): void
  onCopyPath(path: string): void
}

interface ContextMenu {
  x: number
  y: number
  path: string
  kind: 'dir' | 'file'
}

function matchesFilter(entry: FileEntry, filter: TriageFilter): boolean {
  if (!filter) return true
  if (filter === 'dirty') return Boolean(entry.gitDirty)
  const state = displayState(entry)
  return filter === 'attention' ? needsAttention(state) : state === filter
}

export function FileTree(props: Props) {
  const { entries, selection, filterText, stateFilter, pinnedDirs, totals } = props
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<ContextMenu | null>(null)
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

  const { rows, filteredOut } = useMemo(() => {
    const query = filterText.toLowerCase()
    const paths = [...entries.values()]
      .filter(entry => {
        if (query && !entry.path.toLowerCase().includes(query) && !entry.title?.toLowerCase().includes(query)) return false
        return matchesFilter(entry, stateFilter)
      })
      .map(entry => entry.path)
    // Selection survives filtering: keep the selected file visible, dot dimmed.
    const filteredOut = selection !== null && entries.has(selection) && !paths.includes(selection)
    if (filteredOut) paths.push(selection!)
    // A filter shows every match expanded; the collapse set only applies when browsing.
    const tree = orderPinnedFirst(buildTree(paths), new Set(pinnedDirs))
    return { rows: flattenVisible(tree, filtering ? new Set() : collapsed), filteredOut }
  }, [entries, filterText, stateFilter, selection, filtering, collapsed, pinnedDirs])

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
      props.onOpenDiff(selection)
      return
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selection) {
      const dir = selection.slice(0, selection.lastIndexOf('/'))
      if (!dir) return
      event.preventDefault()
      setCollapsed(prev => {
        const next = new Set(prev)
        if (event.key === 'ArrowLeft') next.add(dir)
        else next.delete(dir)
        return next
      })
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
    props.onSelect(next.path)
    containerRef.current?.querySelector(`[data-path="${CSS.escape(next.path)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-[9px] border-b border-line-subtle px-3 pb-[11px] pt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[12.5px] text-ink-body">{totals.files} files</span>
          <span className="text-sep">·</span>
          <span className="text-[12px] text-ink-label">{totals.tracked} tracked</span>
        </div>
        <div className="flex flex-wrap gap-[5px]">
          <TriageChip active={stateFilter === null} title="All files" onClick={() => props.onFilterState(null)}>
            All
          </TriageChip>
          {props.counts.attention > 0 && (
            <TriageChip
              active={stateFilter === 'attention'}
              title="Needs attention"
              onClick={() => props.onFilterState(stateFilter === 'attention' ? null : 'attention')}
            >
              <span className="text-conflict">⚠</span>
              <span>{props.counts.attention}</span>
            </TriageChip>
          )}
          {props.counts.behind > 0 && (
            <TriageChip
              active={stateFilter === 'behind'}
              title="Behind remote"
              onClick={() => props.onFilterState(stateFilter === 'behind' ? null : 'behind')}
            >
              <span className="text-behind">↓</span>
              <span>{props.counts.behind}</span>
            </TriageChip>
          )}
          {props.counts.unverified > 0 && (
            <TriageChip
              active={stateFilter === 'unverified'}
              title="Unverified"
              onClick={() => props.onFilterState(stateFilter === 'unverified' ? null : 'unverified')}
            >
              <StateDot state="unverified" />
              <span>{props.counts.unverified}</span>
            </TriageChip>
          )}
          {props.counts.dirty > 0 && (
            <TriageChip
              active={stateFilter === 'dirty'}
              title="Uncommitted in git"
              onClick={() => props.onFilterState(stateFilter === 'dirty' ? null : 'dirty')}
            >
              <span className="text-warn">±</span>
              <span>{props.counts.dirty}</span>
            </TriageChip>
          )}
        </div>
      </div>

      {/* ponytail: no virtualization - a few hundred rows render fine; virtualise if the repo grows 10x. */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto py-2 pl-1.5 pr-2 outline-none"
      >
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-[12px] text-ink-faint">
            {entries.size === 0 ? 'Scanning…' : 'No files match this filter'}
          </p>
        )}
        {rows.map(row => (
          <Row
            key={row.path}
            node={row}
            entries={entries}
            selected={row.path === selection}
            dimmed={row.path === selection && filteredOut}
            pinned={pinnedDirs.includes(row.path)}
            collapsed={!filtering && collapsed.has(row.path)}
            onClick={() => (row.kind === 'dir' ? toggleDir(row.path) : props.onSelect(row.path))}
            onContextMenu={event => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, path: row.path, kind: row.kind })
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line-subtle px-3 py-[9px]">
        <span className="text-[11.5px] text-ink-label">Legend</span>
        <StateDot state="in-sync" />
        <span className="text-[11px] text-ink-faint">synced</span>
        <StateDot state="unverified" />
        <span className="text-[11px] text-ink-faint">unverified</span>
        <StateDot state="untracked" />
        <span className="text-[11px] text-ink-faint">untracked</span>
      </div>

      {menu && (
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null) }}>
          <div
            className="absolute w-52 overflow-hidden rounded-lg border border-line-menu bg-overlay py-1 shadow-menu"
            style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 160) }}
            onClick={event => event.stopPropagation()}
          >
            {menu.kind === 'dir'
              ? (
                  <>
                    <MenuItem
                      label={pinnedDirs.includes(menu.path) ? 'Unpin' : 'Pin on top'}
                      onClick={() => { props.onTogglePin(menu.path); setMenu(null) }}
                    />
                    <MenuItem
                      label="Check this folder"
                      onClick={() => { props.onCheckFolder(menu.path); setMenu(null) }}
                    />
                    <MenuItem
                      label="Open folder"
                      onClick={() => { props.onOpenFolder(menu.path); setMenu(null) }}
                    />
                    {props.rootDirs.includes(menu.path) && (
                      <>
                        <div className="mx-2 my-1 h-px bg-line" />
                        <MenuItem
                          label="Remove from tree"
                          danger
                          onClick={() => { props.onRemoveFolder(menu.path); setMenu(null) }}
                        />
                      </>
                    )}
                  </>
                )
              : (() => {
                  const entry = entries.get(menu.path)
                  const pageId = entry?.check?.pageId ?? entry?.pageId
                  return (
                    <>
                      <MenuItem
                        label={entry?.ignored ? 'Include in Confluence check' : 'Exclude from Confluence check'}
                        onClick={() => { props.onSetIgnore(menu.path, !entry?.ignored); setMenu(null) }}
                      />
                      <div className="mx-2 my-1 h-px bg-line" />
                      {pageId && (
                        <MenuItem
                          label="Copy page ID"
                          onClick={() => { props.onCopyPageId(pageId); setMenu(null) }}
                        />
                      )}
                      <MenuItem
                        label="Copy file path"
                        onClick={() => { props.onCopyPath(menu.path); setMenu(null) }}
                      />
                    </>
                  )
                })()}
          </div>
        </div>
      )}
    </div>
  )
}

function TriageChip({ active, title, onClick, children }: {
  active: boolean
  title: string
  onClick(): void
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-[9px] py-[3px] text-[11.5px] ${
        active ? 'border-line-active bg-selected text-selected-ink' : 'border-control bg-raised text-ink-dim hover:bg-hover hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function MenuItem({ label, onClick, danger }: { label: string, onClick(): void, danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-[12.5px] ${danger ? 'text-conflict hover:bg-danger-bg' : 'text-ink-body hover:bg-row-hover'}`}
    >
      {label}
    </button>
  )
}

/** Worst child state of a collapsed group, by severity, with its count. */
const ROLLUP_ORDER: DisplayState[] = [...ATTENTION_STATES, 'no-version', 'unverified']

function rollup(node: TreeNode, entries: Map<string, FileEntry>): { state: DisplayState, count: number } | null {
  const states = filesUnder(node).map(path => {
    const entry = entries.get(path)
    return entry ? displayState(entry) : 'unchecked'
  })
  for (const state of ROLLUP_ORDER) {
    const count = states.filter(s => s === state).length
    if (count > 0) return { state, count }
  }
  return null
}

interface RowProps {
  node: TreeNode
  entries: Map<string, FileEntry>
  selected: boolean
  dimmed: boolean
  pinned: boolean
  collapsed: boolean
  onClick(): void
  onContextMenu?(event: React.MouseEvent): void
}

function Row({ node, entries, selected, dimmed, pinned, collapsed, onClick, onContextMenu }: RowProps) {
  const indent = { paddingLeft: `${8 + node.depth * 16}px` }

  if (node.kind === 'dir') {
    const worst = collapsed ? rollup(node, entries) : null
    return (
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={indent}
        className="flex w-full shrink-0 items-center gap-[7px] rounded-[5px] py-[5px] pr-2 text-left hover:bg-row-hover"
      >
        <span className="text-[8px] text-ink-faint">{collapsed ? '▸' : '▾'}</span>
        <span className="truncate text-[12.5px] font-medium text-ink">{node.name}</span>
        {pinned && <span className="text-[9px] text-accent" title="Pinned on top">✦</span>}
        <span className="text-[10.5px] text-ink-ghost">{filesUnder(node).length}</span>
        {worst && (
          <span
            className="ml-auto flex items-center gap-1.5 pl-1 text-[10.5px] text-ink-label"
            title={`${worst.count} ${STATE_META[worst.state].label.toLowerCase()}`}
          >
            <StateDot state={worst.state} />
            {worst.count}
          </span>
        )}
      </button>
    )
  }

  const entry = entries.get(node.path)
  const state = entry ? displayState(entry) : 'unchecked'
  const meta = STATE_META[state]
  const glyphHint = entry?.check && meta.glyph
    ? `${meta.label.toLowerCase()} - v${entry.check.localVersion ?? '-'} → v${entry.check.remoteVersion ?? '-'}`
    : meta.label.toLowerCase()

  return (
    <button
      data-path={node.path}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={`${node.path}${meta.hint ? ` - ${meta.hint}` : ''}`}
      style={indent}
      className={`flex w-full shrink-0 items-center gap-[9px] rounded-[5px] py-[5px] pr-2 text-left ${
        selected ? 'bg-selected shadow-[inset_2px_0_0_var(--color-select-edge)]' : 'hover:bg-row-hover'
      }`}
    >
      <StateDot state={state} dim={dimmed} />
      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${selected ? 'text-ink font-medium' : entry?.tracked ? 'text-ink-mid' : 'text-ink-label'}`}>
        {entry?.title ?? node.name}
      </span>
      {meta.glyph
        ? <span title={glyphHint} className={`shrink-0 text-[11px] ${meta.color}`}>{meta.glyph}</span>
        : entry?.gitDirty && <span title="uncommitted git changes" className="shrink-0 text-[11px] text-warn-text">±</span>}
    </button>
  )
}
